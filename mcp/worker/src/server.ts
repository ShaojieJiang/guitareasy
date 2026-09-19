import { McpServer, ResourceTemplate } from '@modelcontextprotocol/server'
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server'
import { z } from 'zod'
import { getUser, type User } from './auth'
import type { Env } from './env'
import {
  addComment,
  byteLength,
  createScore,
  deleteComment,
  deleteScore,
  getScore,
  listComments,
  listOwnScores,
  MAX_SCORE_BYTES,
  rateScore,
  readTexMetadata,
  searchScores,
  updateScore,
  type Comment,
  type ScoreSummary,
} from './scores'
import { PLAYER_BUNDLE_HASH } from './player-version'
import { seedScores } from './seed-scores'
import { HttpError } from './util'

export type { Env }

const PLAYER_ASSET_ORIGIN = 'https://guitareasy.app'
export const PLAYER_SESSION_KEY_PREFIX = 'player-session:'
const PLAYER_SESSION_TTL_SECONDS = 24 * 60 * 60

function playerResourceMeta(assetOrigin: string) {
  return {
    ui: {
      prefersBorder: true,
      domain: assetOrigin,
      csp: {
        resourceDomains: [assetOrigin],
        connectDomains: [assetOrigin],
        frameDomains: [assetOrigin],
      },
    },
    // ChatGPT compatibility aliases for connections using the legacy
    // Apps SDK metadata rather than the MCP Apps fields above.
    'openai/widgetPrefersBorder': true,
    'openai/widgetDomain': assetOrigin,
    'openai/widgetCSP': {
      resource_domains: [assetOrigin],
      connect_domains: [assetOrigin],
      frame_domains: [assetOrigin],
      redirect_domains: [assetOrigin],
    },
  }
}

// FNV-1a, enough to fingerprint the resource metadata synchronously.
function shortHash(text: string) {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193)
  return (hash >>> 0).toString(16).padStart(8, '0')
}

// Resource URIs are cache keys in MCP Apps hosts: ChatGPT keeps the widget
// HTML and CSP it read for a URI. Deriving the URI from the built bundle and
// the resource metadata makes it change exactly when either does, so hosts
// pick up a new widget without anyone bumping a version by hand.
const PLAYER_RESOURCE_URI = `ui://guitareasy/player/${PLAYER_BUNDLE_HASH}-${shortHash(
  JSON.stringify(playerResourceMeta(PLAYER_ASSET_ORIGIN)),
)}.html`
// Connections that have not refreshed their tool descriptor since an earlier
// deployment still ask for an older URI (ui://guitareasy/player/v14.html or
// an earlier hash). Serve them the current widget too; the unversioned URI
// predates versioning and needs its own registration.
const PREVIOUS_PLAYER_RESOURCE_TEMPLATE = 'ui://guitareasy/player/{version}'
const UNVERSIONED_PLAYER_RESOURCE_URI = 'ui://guitareasy/player'

const themePreferenceSchema = z.enum(['light', 'dark', 'system'])
const scoreIdSchema = z.string().min(1).max(100)

const scoreSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string(),
  artist: z.string(),
  builtIn: z.boolean(),
  size: z.number(),
  owner: z.object({ id: z.string(), displayName: z.string() }).nullable(),
  isOwner: z.boolean(),
  isPublished: z.boolean(),
  publishedAt: z.string().nullable(),
  rating: z.object({ average: z.number().nullable(), count: z.number(), mine: z.number().nullable() }),
  commentCount: z.number(),
  updatedAt: z.string().nullable(),
})
type ToolScoreSummary = z.infer<typeof scoreSummarySchema>

const commentSchema = z.object({
  id: z.string(),
  body: z.string(),
  author: z.object({ id: z.string(), displayName: z.string() }),
  isAuthor: z.boolean(),
  canDelete: z.boolean(),
  createdAt: z.string(),
})

const viewerSchema = z.object({ id: z.string(), displayName: z.string(), email: z.string() })

function toToolSummary(score: ScoreSummary): ToolScoreSummary {
  return {
    id: score.id,
    name: score.name,
    title: score.title,
    artist: score.artist,
    builtIn: false,
    size: score.size,
    owner: score.owner,
    isOwner: score.isOwner,
    isPublished: score.isPublished,
    publishedAt: score.publishedAt,
    rating: score.rating,
    commentCount: score.commentCount,
    updatedAt: score.updatedAt,
  }
}

function seedSummary(seed: (typeof seedScores)[number]): ToolScoreSummary {
  return {
    id: seed.id,
    name: seed.name,
    title: readTexMetadata(seed.tex, 'title'),
    artist: readTexMetadata(seed.tex, 'artist'),
    builtIn: true,
    size: byteLength(seed.tex),
    owner: null,
    isOwner: false,
    isPublished: false,
    publishedAt: null,
    rating: { average: null, count: 0, mine: null },
    commentCount: 0,
    updatedAt: null,
  }
}

function describeScore(score: ToolScoreSummary) {
  const details = [score.artist, score.builtIn ? 'built-in' : score.isPublished ? 'published' : 'private']
  if (score.owner && !score.isOwner) details.push(`by ${score.owner.displayName}`)
  if (score.rating.count) details.push(`${score.rating.average}★ (${score.rating.count})`)
  return `${score.name} [${score.id}] — ${details.filter(Boolean).join(', ')}`
}

function toolError(error: unknown) {
  const message = error instanceof HttpError ? error.message : 'Something went wrong. Try again.'
  if (!(error instanceof HttpError)) console.error(error)
  return { content: [{ type: 'text' as const, text: message }], isError: true }
}

type ResolvedScore = {
  name: string
  tex: string
  summary: ToolScoreSummary | null
}

// Scores come from the signed-in user's library or published scores in D1,
// the built-in seeds, or — for links from older conversations — the
// pre-account shared KV store, which is now read-only.
async function resolveScore(env: Env, id: string, viewerId: string | null): Promise<ResolvedScore> {
  const seed = seedScores.find((score) => score.id === id)
  if (seed) return { name: seed.name, tex: seed.tex, summary: seedSummary(seed) }
  try {
    const score = await getScore(env, id, viewerId)
    return { name: score.name, tex: score.tex, summary: toToolSummary(score) }
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 404) throw error
    const legacy = await env.SCORES_KV.get<{ name: string; tex: string }>(`file:${id}`, 'json')
    if (legacy?.tex) return { name: legacy.name, tex: legacy.tex, summary: null }
    throw error
  }
}

// With a userId, every tool acts as that signed-in user. Without one (the
// public /mcp/public endpoint), only the read-only tools and the player are
// registered, and they see built-in and published scores.
export function createServer(env: Env, request: Request | undefined, userId: string | null): McpServer {
  const server = new McpServer({ name: 'GuitarEasy alphaTex Server', version: '2.0.0' })
  let cachedUser: Promise<User | undefined> | undefined
  const currentUser = async () => {
    if (!userId) throw new HttpError(401, 'sign_in_required', 'Connect to https://guitareasy.app/mcp and sign in to do this.')
    cachedUser ??= getUser(env, userId)
    const user = await cachedUser
    if (!user) throw new HttpError(401, 'account_missing', 'This GuitarEasy account no longer exists. Reconnect to sign in again.')
    return user
  }
  const viewer = async () => {
    if (!userId) return null
    const user = await currentUser()
    return { id: user.id, displayName: user.displayName, email: user.email }
  }
  // Confirms the account still exists before acting for it.
  const viewerId = async () => (userId ? (await currentUser()).id : null)
  const signedIn = userId !== null

  server.registerTool(
    'download_atex',
    {
      title: 'Download alphaTex file',
      description: signedIn
        ? "Retrieve the alphaTex source of a built-in score, one of the user's scores, or a published score."
        : 'Retrieve the alphaTex source of a built-in or published score.',
      inputSchema: z.object({ id: scoreIdSchema }),
      outputSchema: z.object({ id: z.string(), name: z.string(), tex: z.string() }),
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      try {
        const score = await resolveScore(env, id, await viewerId())
        return {
          content: [{ type: 'text', text: score.tex }],
          structuredContent: { id, name: score.name, tex: score.tex },
        }
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'list_atex_files',
    {
      title: signedIn ? 'List my alphaTex scores' : 'List built-in alphaTex scores',
      description: signedIn
        ? "List the built-in example scores and the signed-in user's saved scores."
        : 'List the built-in example scores. Use search_scores to find scores published by GuitarEasy users.',
      inputSchema: z.object({}),
      outputSchema: z.object({ files: z.array(scoreSummarySchema) }),
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        const id = await viewerId()
        const own = id ? await listOwnScores(env, id) : []
        const files = [...seedScores.map(seedSummary), ...own.map(toToolSummary)]
        return {
          content: [{ type: 'text', text: files.map(describeScore).join('\n') }],
          structuredContent: { files },
        }
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'search_scores',
    {
      title: 'Search scores',
      description: signedIn
        ? "Search built-in scores, the user's own scores, and scores published by other users by file name, song title, artist, or uploader."
        : 'Search built-in scores and scores published by GuitarEasy users by file name, song title, artist, or uploader.',
      inputSchema: z.object({ query: z.string().max(200).describe('Words to match, e.g. "romance" or "Djawadi".') }),
      outputSchema: z.object({ query: z.string(), scores: z.array(scoreSummarySchema) }),
      annotations: { readOnlyHint: true },
    },
    async ({ query }) => {
      try {
        const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
        const seeds = seedScores
          .map(seedSummary)
          .filter((seed) => terms.every((term) => `${seed.name} ${seed.title} ${seed.artist}`.toLowerCase().includes(term)))
        const found = await searchScores(env, query, await viewerId())
        const scores = [...seeds, ...found.map(toToolSummary)]
        return {
          content: [{ type: 'text', text: scores.length ? scores.map(describeScore).join('\n') : `No scores match "${query}".` }],
          structuredContent: { query, scores },
        }
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'get_score_details',
    {
      title: 'Get score ratings and comments',
      description: 'Show the publish status, star rating, and comments of a score.',
      inputSchema: z.object({ id: scoreIdSchema }),
      outputSchema: z.object({ score: scoreSummarySchema, comments: z.array(commentSchema), viewer: viewerSchema.nullable() }),
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      try {
        const user = await viewer()
        const resolved = await resolveScore(env, id, user?.id ?? null)
        if (!resolved.summary) throw new HttpError(404, 'score_not_found', 'That score has no details to show.')
        const comments: Comment[] = resolved.summary.builtIn ? [] : await listComments(env, id, user?.id ?? null)
        const lines = [describeScore(resolved.summary), ...comments.map((comment) => `${comment.author.displayName}: ${comment.body}`)]
        return {
          content: [{ type: 'text', text: lines.join('\n') }],
          structuredContent: { score: resolved.summary, comments, viewer: user },
        }
      } catch (error) {
        return toolError(error)
      }
    },
  )

  registerAppTool(
    server,
    'play_atex',
    {
      title: 'Play alphaTex score',
      description:
        signedIn
          ? 'Open a saved, built-in, published, or inline alphaTex score in the interactive GuitarEasy tab player.'
          : 'Open a built-in, published, or inline alphaTex score in the interactive GuitarEasy tab player.',
      inputSchema: z.object({
        id: scoreIdSchema.optional().describe(signedIn ? 'id of a saved, built-in, or published score.' : 'id of a built-in or published score.'),
        tex: z.string().min(1).max(MAX_SCORE_BYTES).optional().describe('Inline alphaTex source, used when no id is given.'),
        name: z.string().min(1).optional().describe('Display name when passing inline tex.'),
        theme: themePreferenceSchema
          .optional()
          .default('system')
          .describe('Widget color theme: dark, light, or system. Use dark to force dark mode.'),
      }),
      outputSchema: z.object({
        id: z.string().nullable(),
        name: z.string(),
        tex: z.string(),
        playbackUrl: z.string().url(),
        theme: themePreferenceSchema,
        score: scoreSummarySchema.nullable(),
        comments: z.array(commentSchema),
        viewer: viewerSchema.nullable(),
      }),
      _meta: {
        ui: { resourceUri: PLAYER_RESOURCE_URI },
        'openai/outputTemplate': PLAYER_RESOURCE_URI,
      },
    },
    async ({ id, tex, name, theme }) => {
      try {
        const user = await viewer()
        let resolved: ResolvedScore
        if (id) resolved = await resolveScore(env, id, user?.id ?? null)
        else if (tex) resolved = { name: name ?? 'Untitled.atex', tex, summary: null }
        else return toolError(new HttpError(400, 'missing_score', 'Provide either an "id" or inline "tex".'))

        const comments =
          resolved.summary && !resolved.summary.builtIn ? await listComments(env, resolved.summary.id, user?.id ?? null) : []

        // ChatGPT does not currently delegate the `autoplay` permission to
        // plugin iframes. Give the widget an opaque, short-lived URL that it
        // can ask the host to open as a first-party page for audio.
        const playbackToken = crypto.randomUUID()
        await env.SCORES_KV.put(
          `${PLAYER_SESSION_KEY_PREFIX}${playbackToken}`,
          JSON.stringify({ name: resolved.name, tex: resolved.tex }),
          { expirationTtl: PLAYER_SESSION_TTL_SECONDS },
        )
        const origin = request ? new URL(request.url).origin : PLAYER_ASSET_ORIGIN
        const playbackUrl = `${origin}/mcp-app/?session=${encodeURIComponent(playbackToken)}`

        return {
          content: [{ type: 'text', text: `Opened "${resolved.name}" in the player.` }],
          structuredContent: {
            id: resolved.summary?.id ?? (id || null),
            name: resolved.name,
            tex: resolved.tex,
            playbackUrl,
            theme,
            score: resolved.summary,
            comments,
            viewer: user,
          },
        }
      } catch (error) {
        return toolError(error)
      }
    },
  )

  const readPlayer = async (uri: URL) => {
    const origin = request ? new URL(request.url).origin : undefined
    const assetUrl = new URL('/mcp-app/index.html', origin ?? 'https://player.internal/')
    const assetResponse = await env.ASSETS.fetch(new Request(assetUrl))
    let html = await assetResponse.text()
    const assetOrigin = origin ?? PLAYER_ASSET_ORIGIN
    // ChatGPT renders the resource on a sandbox origin. Make every
    // external asset URL explicit instead of relying on <base>, which is
    // not part of ChatGPT's documented widget CSP contract.
    html = html
      .replaceAll('src="/mcp-app/', `src="${assetOrigin}/mcp-app/`)
      .replaceAll('href="/mcp-app/', `href="${assetOrigin}/mcp-app/`)
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: RESOURCE_MIME_TYPE,
          text: html,
          _meta: playerResourceMeta(assetOrigin),
        },
      ],
    }
  }
  const playerResourceConfig = { mimeType: RESOURCE_MIME_TYPE, _meta: playerResourceMeta(PLAYER_ASSET_ORIGIN) }
  registerAppResource(server, 'GuitarEasy player', PLAYER_RESOURCE_URI, playerResourceConfig, readPlayer)
  registerAppResource(server, 'GuitarEasy player (unversioned)', UNVERSIONED_PLAYER_RESOURCE_URI, playerResourceConfig, readPlayer)
  server.registerResource(
    'GuitarEasy player (previous versions)',
    new ResourceTemplate(PREVIOUS_PLAYER_RESOURCE_TEMPLATE, { list: undefined }),
    playerResourceConfig,
    readPlayer,
  )

  // Everything below needs a signed-in account.
  if (!userId) return server

  server.registerTool(
    'get_current_user',
    {
      title: 'Get signed-in GuitarEasy user',
      description: 'Show which GuitarEasy account this connection is signed in as.',
      inputSchema: z.object({}),
      outputSchema: z.object({ user: viewerSchema }),
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        const { id, displayName, email } = await currentUser()
        const user = { id, displayName, email }
        return {
          content: [{ type: 'text', text: `Signed in as ${user.displayName} (${user.email}).` }],
          structuredContent: { user },
        }
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'upload_atex',
    {
      title: 'Save alphaTex score',
      description:
        "Save a .atex (alphaTex) score to the signed-in user's GuitarEasy library. Saved scores are private until published.",
      inputSchema: z.object({
        name: z.string().min(1).max(200).describe('File name, e.g. "My Song.atex".'),
        tex: z.string().min(1).describe('Full alphaTex notation source.'),
        publish: z.boolean().optional().default(false).describe('Publish immediately so other users can find it.'),
      }),
      outputSchema: z.object({ id: z.string(), name: z.string(), score: scoreSummarySchema }),
    },
    async ({ name, tex, publish }) => {
      try {
        const score = await createScore(env, (await currentUser()).id, { name, tex, published: publish })
        return {
          content: [{ type: 'text', text: `Saved "${score.name}" as ${score.id}${score.isPublished ? ' and published it' : ''}.` }],
          structuredContent: { id: score.id, name: score.name, score: toToolSummary(score) },
        }
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'update_atex',
    {
      title: 'Update alphaTex score',
      description: "Rename a saved score or replace its alphaTex source. Only the score's owner can update it.",
      inputSchema: z.object({
        id: scoreIdSchema,
        name: z.string().min(1).max(200).optional(),
        tex: z.string().min(1).optional(),
      }),
      outputSchema: z.object({ score: scoreSummarySchema }),
    },
    async ({ id, name, tex }) => {
      try {
        const score = await updateScore(env, (await currentUser()).id, id, { name, tex })
        return {
          content: [{ type: 'text', text: `Updated "${score.name}".` }],
          structuredContent: { score: toToolSummary(score) },
        }
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'delete_atex',
    {
      title: 'Delete alphaTex score',
      description: "Permanently delete one of the signed-in user's saved scores, with its ratings and comments.",
      inputSchema: z.object({ id: scoreIdSchema }),
      outputSchema: z.object({ id: z.string(), deleted: z.boolean() }),
      annotations: { destructiveHint: true },
    },
    async ({ id }) => {
      try {
        await deleteScore(env, (await currentUser()).id, id)
        return { content: [{ type: 'text', text: `Deleted score ${id}.` }], structuredContent: { id, deleted: true } }
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'publish_score',
    {
      title: 'Publish or unpublish a score',
      description:
        'Publish one of the user\'s scores so every GuitarEasy user can find, rate, and comment on it, or pass published=false to make it private again.',
      inputSchema: z.object({ id: scoreIdSchema, published: z.boolean().optional().default(true) }),
      outputSchema: z.object({ score: scoreSummarySchema }),
    },
    async ({ id, published }) => {
      try {
        const score = await updateScore(env, (await currentUser()).id, id, { published })
        return {
          content: [{ type: 'text', text: `"${score.name}" is now ${score.isPublished ? 'published' : 'private'}.` }],
          structuredContent: { score: toToolSummary(score) },
        }
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'rate_score',
    {
      title: 'Rate a published score',
      description: "Give another user's published score 1 to 5 stars. Rating again replaces the earlier rating.",
      inputSchema: z.object({ id: scoreIdSchema, stars: z.number().int().min(1).max(5) }),
      outputSchema: z.object({ score: scoreSummarySchema }),
    },
    async ({ id, stars }) => {
      try {
        const score = await rateScore(env, (await currentUser()).id, id, stars)
        return {
          content: [{ type: 'text', text: `Rated "${score.name}" ${stars}★. Average ${score.rating.average}★ from ${score.rating.count} rating(s).` }],
          structuredContent: { score: toToolSummary(score) },
        }
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'add_comment',
    {
      title: 'Comment on a published score',
      description: 'Post a comment on a published score. Any signed-in user can comment, including the owner.',
      inputSchema: z.object({ id: scoreIdSchema, body: z.string().min(1).max(2000) }),
      outputSchema: z.object({ comment: commentSchema }),
    },
    async ({ id, body }) => {
      try {
        const comment = await addComment(env, (await currentUser()).id, id, body)
        return { content: [{ type: 'text', text: 'Comment posted.' }], structuredContent: { comment } }
      } catch (error) {
        return toolError(error)
      }
    },
  )

  server.registerTool(
    'delete_comment',
    {
      title: 'Delete a comment',
      description: 'Delete a comment you wrote, or any comment on a score you own.',
      inputSchema: z.object({ commentId: z.string().min(1).max(100) }),
      outputSchema: z.object({ commentId: z.string(), scoreId: z.string() }),
      annotations: { destructiveHint: true },
    },
    async ({ commentId }) => {
      try {
        const { scoreId } = await deleteComment(env, (await currentUser()).id, commentId)
        return { content: [{ type: 'text', text: 'Comment deleted.' }], structuredContent: { commentId, scoreId } }
      } catch (error) {
        return toolError(error)
      }
    },
  )

  return server
}
