import { McpServer } from '@modelcontextprotocol/server'
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server'
import { z } from 'zod'
import { seedScores } from './seed-scores'

export interface Env {
  SCORES_KV: KVNamespace
  ASSETS: Fetcher
}

// Resource URIs are cache keys in MCP Apps hosts. Bump this when the HTML,
// bundle, or security policy changes so hosts do not keep an older broken
// widget after a deployment.
const PLAYER_RESOURCE_URI = 'ui://guitareasy/player/v11.html'
// Keep older cache keys readable for ChatGPT connections that have not
// refreshed their tool descriptor since a previous UI deployment.
const LEGACY_PLAYER_RESOURCE_URIS = [
  'ui://guitareasy/player/v10.html',
  'ui://guitareasy/player/v9.html',
  'ui://guitareasy/player/v8.html',
  'ui://guitareasy/player/v7.html',
  'ui://guitareasy/player/v6.html',
  'ui://guitareasy/player/v5.html',
  'ui://guitareasy/player/v4.html',
  'ui://guitareasy/player/v3.html',
  'ui://guitareasy/player/v2.html',
  'ui://guitareasy/player',
] as const
const PLAYER_ASSET_ORIGIN = 'https://guitareasy.app'
export const PLAYER_SESSION_KEY_PREFIX = 'player-session:'
const PLAYER_SESSION_TTL_SECONDS = 24 * 60 * 60
const MAX_FILE_BYTES = 256 * 1024
const MAX_INDEX_ENTRIES = 200
const INDEX_KEY = 'index'
const SEEDED_KEY = 'seeded'

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

type FileMeta = { id: string; name: string; size: number; uploadedAt: string }
type FileRecord = FileMeta & { tex: string }

async function readIndex(env: Env): Promise<FileMeta[]> {
  const raw = await env.SCORES_KV.get(INDEX_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as FileMeta[]) : []
  } catch {
    return []
  }
}

async function writeIndex(env: Env, index: FileMeta[]): Promise<void> {
  await env.SCORES_KV.put(INDEX_KEY, JSON.stringify(index))
}

async function ensureSeeded(env: Env): Promise<void> {
  if (await env.SCORES_KV.get(SEEDED_KEY)) return
  const index = await readIndex(env)
  const existingIds = new Set(index.map((file) => file.id))
  for (const score of seedScores) {
    if (existingIds.has(score.id)) continue
    const meta: FileMeta = {
      id: score.id,
      name: score.name,
      size: score.tex.length,
      uploadedAt: new Date(0).toISOString(),
    }
    const record: FileRecord = { ...meta, tex: score.tex }
    await env.SCORES_KV.put(`file:${score.id}`, JSON.stringify(record))
    index.push(meta)
  }
  await writeIndex(env, index)
  await env.SCORES_KV.put(SEEDED_KEY, '1')
}

async function getFile(env: Env, id: string): Promise<FileRecord | undefined> {
  const raw = await env.SCORES_KV.get(`file:${id}`)
  if (!raw) return undefined
  return JSON.parse(raw) as FileRecord
}

export function createServer(env: Env, request?: Request): McpServer {
  const server = new McpServer({ name: 'GuitarEasy alphaTex Server', version: '1.0.0' })

  server.registerTool(
    'upload_atex',
    {
      title: 'Upload alphaTex file',
      description: 'Store a .atex (alphaTex) score so it can be listed, downloaded, or played later.',
      inputSchema: z.object({
        name: z.string().min(1).max(200).describe('File name, e.g. "My Song.atex".'),
        tex: z.string().min(1).describe('Full alphaTex notation source.'),
      }),
      outputSchema: z.object({ id: z.string(), name: z.string() }),
    },
    async ({ name, tex }) => {
      await ensureSeeded(env)
      if (new TextEncoder().encode(tex).length > MAX_FILE_BYTES) {
        return {
          content: [{ type: 'text', text: `File exceeds the ${MAX_FILE_BYTES / 1024}KB limit.` }],
          isError: true,
        }
      }
      const id = crypto.randomUUID()
      const meta: FileMeta = { id, name, size: tex.length, uploadedAt: new Date().toISOString() }
      const record: FileRecord = { ...meta, tex }
      await env.SCORES_KV.put(`file:${id}`, JSON.stringify(record))

      const index = await readIndex(env)
      index.push(meta)
      while (index.length > MAX_INDEX_ENTRIES) {
        const evicted = index.shift()
        if (evicted) await env.SCORES_KV.delete(`file:${evicted.id}`)
      }
      await writeIndex(env, index)

      return {
        content: [{ type: 'text', text: `Uploaded "${name}" as ${id}.` }],
        structuredContent: { id, name },
      }
    },
  )

  server.registerTool(
    'download_atex',
    {
      title: 'Download alphaTex file',
      description: 'Retrieve a previously uploaded (or bundled) .atex score by id.',
      inputSchema: z.object({ id: z.string().min(1) }),
      outputSchema: z.object({ id: z.string(), name: z.string(), tex: z.string() }),
    },
    async ({ id }) => {
      await ensureSeeded(env)
      const record = await getFile(env, id)
      if (!record) {
        return { content: [{ type: 'text', text: `No file found with id "${id}".` }], isError: true }
      }
      return {
        content: [{ type: 'text', text: record.tex }],
        structuredContent: { id: record.id, name: record.name, tex: record.tex },
      }
    },
  )

  server.registerTool(
    'list_atex_files',
    {
      title: 'List alphaTex files',
      description: 'List bundled and uploaded .atex scores available on this server.',
      inputSchema: z.object({}),
      outputSchema: z.object({
        files: z.array(
          z.object({ id: z.string(), name: z.string(), size: z.number(), uploadedAt: z.string() }),
        ),
      }),
    },
    async () => {
      await ensureSeeded(env)
      const files = await readIndex(env)
      return {
        content: [
          {
            type: 'text',
            text: files.length ? files.map((file) => `${file.name} (${file.id})`).join('\n') : 'No files yet.',
          },
        ],
        structuredContent: { files },
      }
    },
  )

  registerAppTool(
    server,
    'play_atex',
    {
      title: 'Play alphaTex score',
      description:
        'Open a stored or inline alphaTex score in the interactive alphaTab player so the user can see and play it.',
      inputSchema: z.object({
        id: z.string().min(1).optional().describe('id of a previously uploaded or bundled file.'),
        tex: z.string().min(1).optional().describe('Inline alphaTex source, used when no id is given.'),
        name: z.string().min(1).optional().describe('Display name when passing inline tex.'),
      }),
      outputSchema: z.object({ name: z.string(), tex: z.string(), playbackUrl: z.string().url() }),
      _meta: {
        ui: { resourceUri: PLAYER_RESOURCE_URI },
        'openai/outputTemplate': PLAYER_RESOURCE_URI,
      },
    },
    async ({ id, tex, name }) => {
      await ensureSeeded(env)
      let resolvedTex = tex
      let resolvedName = name ?? 'Untitled.atex'

      if (id) {
        const record = await getFile(env, id)
        if (!record) {
          return { content: [{ type: 'text', text: `No file found with id "${id}".` }], isError: true }
        }
        resolvedTex = record.tex
        resolvedName = record.name
      }

      if (!resolvedTex) {
        return { content: [{ type: 'text', text: 'Provide either an "id" or inline "tex".' }], isError: true }
      }

      // ChatGPT does not currently delegate the `autoplay` permission to
      // plugin iframes. Give the widget an opaque, short-lived URL that it can
      // ask the host to open as a first-party page when the user wants audio.
      const playbackToken = crypto.randomUUID()
      await env.SCORES_KV.put(
        `${PLAYER_SESSION_KEY_PREFIX}${playbackToken}`,
        JSON.stringify({ name: resolvedName, tex: resolvedTex }),
        { expirationTtl: PLAYER_SESSION_TTL_SECONDS },
      )
      const origin = request ? new URL(request.url).origin : PLAYER_ASSET_ORIGIN
      const playbackUrl = `${origin}/mcp-app/?session=${encodeURIComponent(playbackToken)}`

      return {
        content: [{ type: 'text', text: `Opened "${resolvedName}" in the player.` }],
        structuredContent: { name: resolvedName, tex: resolvedTex, playbackUrl },
      }
    },
  )

  for (const resourceUri of [PLAYER_RESOURCE_URI, ...LEGACY_PLAYER_RESOURCE_URIS]) {
    registerAppResource(
      server,
      'GuitarEasy player',
      resourceUri,
      {
        mimeType: RESOURCE_MIME_TYPE,
        _meta: playerResourceMeta(PLAYER_ASSET_ORIGIN),
      },
      async () => {
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
              uri: resourceUri,
              mimeType: RESOURCE_MIME_TYPE,
              text: html,
              _meta: playerResourceMeta(assetOrigin),
            },
          ],
        }
      },
    )
  }

  return server
}
