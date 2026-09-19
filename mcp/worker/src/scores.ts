// D1 data layer for cloud scores, publishing, ratings, comments, and search.
// Shared by the website's REST API and the MCP tools so both enforce the same
// ownership and visibility rules.
import type { Env } from './env'
import { HttpError, newId } from './util'

export const MAX_SCORE_BYTES = 256 * 1024
export const MAX_IMPORT_SCORES = 100
export const MAX_COMMENT_LENGTH = 2000
const SEARCH_LIMIT = 50

export type ScoreSummary = {
  id: string
  name: string
  title: string
  artist: string
  size: number
  owner: { id: string; displayName: string }
  isOwner: boolean
  isPublished: boolean
  publishedAt: string | null
  rating: { average: number | null; count: number; mine: number | null }
  commentCount: number
  createdAt: string
  updatedAt: string
}

export type Score = ScoreSummary & { tex: string }

export type Comment = {
  id: string
  body: string
  author: { id: string; displayName: string }
  isAuthor: boolean
  canDelete: boolean
  createdAt: string
}

type ScoreRow = {
  id: string
  owner_id: string
  owner_name: string | null
  owner_email: string
  name: string
  title: string
  artist: string
  size: number
  published_at: number | null
  rating_count: number
  rating_total: number
  comment_count: number
  created_at: number
  updated_at: number
  my_stars: number | null
  tex?: string
}

const SUMMARY_COLUMNS = `
  scores.id, scores.owner_id, users.display_name AS owner_name, users.email AS owner_email,
  scores.name, scores.title, scores.artist, scores.size, scores.published_at,
  scores.rating_count, scores.rating_total, scores.comment_count, scores.created_at, scores.updated_at,
  (SELECT stars FROM ratings WHERE ratings.score_id = scores.id AND ratings.user_id = ?1) AS my_stars`

function displayName(name: string | null, email: string) {
  return name || email.split('@')[0]!.slice(0, 40) || 'Guitarist'
}

function toSummary(row: ScoreRow, viewerId: string | null): ScoreSummary {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    artist: row.artist,
    size: row.size,
    owner: { id: row.owner_id, displayName: displayName(row.owner_name, row.owner_email) },
    isOwner: row.owner_id === viewerId,
    isPublished: row.published_at !== null,
    publishedAt: row.published_at === null ? null : new Date(row.published_at).toISOString(),
    rating: {
      average: row.rating_count ? Math.round((row.rating_total / row.rating_count) * 10) / 10 : null,
      count: row.rating_count,
      mine: row.my_stars,
    },
    commentCount: row.comment_count,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

// Reads a quoted or bare alphaTex metadata value such as `\title "Canon"`,
// `\title Canon`, or `\title ("Canon")`, ignoring commented-out lines.
export function readTexMetadata(tex: string, key: 'title' | 'artist') {
  const pattern = new RegExp(`^[ \\t]*\\\\${key}[ \\t]*\\(?[ \\t]*(?:"((?:[^"\\\\]|\\\\.)*)"|'((?:[^'\\\\]|\\\\.)*)'|([^\\s{(]+))`, 'im')
  const match = pattern.exec(tex.replace(/\/\*[\s\S]*?\*\//g, ''))
  return (match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim().slice(0, 200)
}

export function normalizeScoreName(value: unknown) {
  const name = typeof value === 'string' ? value.trim().replace(/\.alphatex$/i, '.atex') : ''
  if (!name) throw new HttpError(400, 'invalid_name', 'Give the score a name.')
  return name.slice(0, 200)
}

export function byteLength(value: string) {
  return new TextEncoder().encode(value).length
}

export function validateTex(value: unknown) {
  const tex = typeof value === 'string' ? value.trim() : ''
  if (!tex) throw new HttpError(400, 'empty_score', 'The score has no alphaTex notation.')
  if (byteLength(tex) > MAX_SCORE_BYTES) {
    throw new HttpError(413, 'score_too_large', `Scores are limited to ${MAX_SCORE_BYTES / 1024} KB.`)
  }
  return tex
}

async function findRow(env: Env, scoreId: string, viewerId: string | null, withTex = false) {
  return env.DB.prepare(
    `SELECT ${SUMMARY_COLUMNS}${withTex ? ', scores.tex' : ''}
     FROM scores JOIN users ON users.id = scores.owner_id WHERE scores.id = ?2`,
  )
    .bind(viewerId, scoreId)
    .first<ScoreRow>()
}

// Unpublished scores are private. A missing score and someone else's
// private score both answer 404, so ids cannot be probed.
async function requireVisibleRow(env: Env, scoreId: string, viewerId: string | null, withTex = false) {
  const row = await findRow(env, scoreId, viewerId, withTex)
  if (!row || (row.published_at === null && row.owner_id !== viewerId)) {
    throw new HttpError(404, 'score_not_found', 'That score does not exist or is private.')
  }
  return row
}

async function requireOwnedRow(env: Env, scoreId: string, userId: string) {
  const row = await requireVisibleRow(env, scoreId, userId)
  if (row.owner_id !== userId) throw new HttpError(403, 'not_owner', 'Only the owner can change this score.')
  return row
}

export async function getScore(env: Env, scoreId: string, viewerId: string | null): Promise<Score> {
  const row = await requireVisibleRow(env, scoreId, viewerId, true)
  return { ...toSummary(row, viewerId), tex: row.tex! }
}

export async function getScoreSummary(env: Env, scoreId: string, viewerId: string | null) {
  return toSummary(await requireVisibleRow(env, scoreId, viewerId), viewerId)
}

export async function listOwnScores(env: Env, userId: string): Promise<ScoreSummary[]> {
  const { results } = await env.DB.prepare(
    `SELECT ${SUMMARY_COLUMNS} FROM scores JOIN users ON users.id = scores.owner_id
     WHERE scores.owner_id = ?1 ORDER BY scores.updated_at DESC`,
  )
    .bind(userId)
    .all<ScoreRow>()
  return results.map((row) => toSummary(row, userId))
}

export async function createScore(
  env: Env,
  userId: string,
  input: { name?: unknown; tex?: unknown; clientId?: unknown; published?: unknown },
): Promise<Score> {
  const name = normalizeScoreName(input.name)
  const tex = validateTex(input.tex)
  const clientId = typeof input.clientId === 'string' && input.clientId ? input.clientId.slice(0, 100) : null
  const now = Date.now()
  const id = newId()
  // ON CONFLICT DO NOTHING makes a retried upload of the same browser score
  // a no-op; the existing row is returned below.
  await env.DB.prepare(
    `INSERT INTO scores (id, owner_id, client_id, name, title, artist, tex, size, published_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT DO NOTHING`,
  )
    .bind(
      id,
      userId,
      clientId,
      name,
      readTexMetadata(tex, 'title'),
      readTexMetadata(tex, 'artist'),
      tex,
      byteLength(tex),
      input.published === true ? now : null,
      now,
      now,
    )
    .run()
  if (clientId) {
    const existing = await env.DB.prepare('SELECT id FROM scores WHERE owner_id = ? AND client_id = ?')
      .bind(userId, clientId)
      .first<{ id: string }>()
    if (existing) return getScore(env, existing.id, userId)
  }
  return getScore(env, id, userId)
}

export async function importScores(env: Env, userId: string, input: unknown) {
  if (!Array.isArray(input) || input.length > MAX_IMPORT_SCORES) {
    throw new HttpError(400, 'invalid_import', `Upload between 0 and ${MAX_IMPORT_SCORES} scores at a time.`)
  }
  const imported: Array<{ clientId: string; score: ScoreSummary }> = []
  const failed: Array<{ clientId: string; message: string }> = []
  for (const item of input) {
    const clientId = typeof item?.clientId === 'string' ? item.clientId : ''
    if (!clientId) continue
    try {
      const { tex: _tex, ...score } = await createScore(env, userId, { ...item, clientId })
      imported.push({ clientId, score })
    } catch (error) {
      failed.push({ clientId, message: error instanceof Error ? error.message : 'Upload failed.' })
    }
  }
  return { imported, failed }
}

export async function updateScore(
  env: Env,
  userId: string,
  scoreId: string,
  input: { name?: unknown; tex?: unknown; published?: unknown },
): Promise<Score> {
  const row = await requireOwnedRow(env, scoreId, userId)
  const name = input.name === undefined ? row.name : normalizeScoreName(input.name)
  const tex = input.tex === undefined ? undefined : validateTex(input.tex)
  let publishedAt = row.published_at
  if (input.published === true && publishedAt === null) publishedAt = Date.now()
  if (input.published === false) publishedAt = null

  if (tex === undefined) {
    await env.DB.prepare('UPDATE scores SET name = ?, published_at = ?, updated_at = ? WHERE id = ?')
      .bind(name, publishedAt, Date.now(), scoreId)
      .run()
  } else {
    await env.DB.prepare(
      'UPDATE scores SET name = ?, tex = ?, size = ?, title = ?, artist = ?, published_at = ?, updated_at = ? WHERE id = ?',
    )
      .bind(
        name,
        tex,
        byteLength(tex),
        readTexMetadata(tex, 'title'),
        readTexMetadata(tex, 'artist'),
        publishedAt,
        Date.now(),
        scoreId,
      )
      .run()
  }
  return getScore(env, scoreId, userId)
}

export async function deleteScore(env: Env, userId: string, scoreId: string) {
  await requireOwnedRow(env, scoreId, userId)
  await env.DB.prepare('DELETE FROM scores WHERE id = ?').bind(scoreId).run()
}

function likePattern(term: string) {
  return `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
}

// Every word must appear in the file name, title, artist, or uploader name.
// Signed-in users see their own private scores alongside published ones.
export async function searchScores(env: Env, query: unknown, viewerId: string | null) {
  const terms = (typeof query === 'string' ? query : '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
  const params: unknown[] = [viewerId]
  const clauses = terms.map((term) => {
    params.push(likePattern(term))
    const index = params.length
    return `(scores.name LIKE ?${index} ESCAPE '\\' OR scores.title LIKE ?${index} ESCAPE '\\'
      OR scores.artist LIKE ?${index} ESCAPE '\\' OR users.display_name LIKE ?${index} ESCAPE '\\')`
  })
  const visibility = viewerId ? '(scores.published_at IS NOT NULL OR scores.owner_id = ?1)' : 'scores.published_at IS NOT NULL'
  const { results } = await env.DB.prepare(
    `SELECT ${SUMMARY_COLUMNS} FROM scores JOIN users ON users.id = scores.owner_id
     WHERE ${[visibility, ...clauses].join(' AND ')}
     ORDER BY (scores.owner_id = ?1) DESC,
       CASE WHEN scores.rating_count > 0 THEN scores.rating_total * 1.0 / scores.rating_count ELSE 0 END DESC,
       scores.updated_at DESC
     LIMIT ${SEARCH_LIMIT}`,
  )
    .bind(...params)
    .all<ScoreRow>()
  return results.map((row) => toSummary(row, viewerId))
}

function requirePublished(row: ScoreRow) {
  if (row.published_at === null) {
    throw new HttpError(409, 'not_published', 'Publish this score before it can be rated or commented on.')
  }
}

export async function rateScore(env: Env, userId: string, scoreId: string, starsInput: unknown) {
  const stars = Number(starsInput)
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    throw new HttpError(400, 'invalid_rating', 'Ratings are whole stars from 1 to 5.')
  }
  const row = await requireVisibleRow(env, scoreId, userId)
  requirePublished(row)
  if (row.owner_id === userId) throw new HttpError(403, 'own_score', 'You cannot rate your own score.')
  const now = Date.now()
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO ratings (score_id, user_id, stars, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (score_id, user_id) DO UPDATE SET stars = excluded.stars, updated_at = excluded.updated_at`,
    ).bind(scoreId, userId, stars, now, now),
    env.DB.prepare(
      `UPDATE scores SET
         rating_count = (SELECT COUNT(*) FROM ratings WHERE score_id = ?1),
         rating_total = (SELECT COALESCE(SUM(stars), 0) FROM ratings WHERE score_id = ?1)
       WHERE id = ?1`,
    ).bind(scoreId),
  ])
  return getScoreSummary(env, scoreId, userId)
}

export async function listComments(env: Env, scoreId: string, viewerId: string | null): Promise<Comment[]> {
  const score = await requireVisibleRow(env, scoreId, viewerId)
  const { results } = await env.DB.prepare(
    `SELECT comments.id, comments.body, comments.user_id, comments.created_at, users.display_name, users.email
     FROM comments JOIN users ON users.id = comments.user_id
     WHERE comments.score_id = ? ORDER BY comments.created_at ASC LIMIT 500`,
  )
    .bind(scoreId)
    .all<{ id: string; body: string; user_id: string; created_at: number; display_name: string | null; email: string }>()
  return results.map((row) => ({
    id: row.id,
    body: row.body,
    author: { id: row.user_id, displayName: displayName(row.display_name, row.email) },
    isAuthor: row.user_id === viewerId,
    canDelete: row.user_id === viewerId || score.owner_id === viewerId,
    createdAt: new Date(row.created_at).toISOString(),
  }))
}

function refreshCommentCount(env: Env, scoreId: string) {
  return env.DB.prepare(
    'UPDATE scores SET comment_count = (SELECT COUNT(*) FROM comments WHERE score_id = ?1) WHERE id = ?1',
  ).bind(scoreId)
}

export async function addComment(env: Env, userId: string, scoreId: string, bodyInput: unknown) {
  const body = typeof bodyInput === 'string' ? bodyInput.trim() : ''
  if (!body || body.length > MAX_COMMENT_LENGTH) {
    throw new HttpError(400, 'invalid_comment', `Comments must be 1 to ${MAX_COMMENT_LENGTH} characters.`)
  }
  requirePublished(await requireVisibleRow(env, scoreId, userId))
  const id = newId()
  await env.DB.batch([
    env.DB.prepare('INSERT INTO comments (id, score_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)').bind(
      id,
      scoreId,
      userId,
      body,
      Date.now(),
    ),
    refreshCommentCount(env, scoreId),
  ])
  const comments = await listComments(env, scoreId, userId)
  return comments.find((comment) => comment.id === id)!
}

// Authors can remove their own comments; score owners can moderate any
// comment on their score.
export async function deleteComment(env: Env, userId: string, commentId: string) {
  const row = await env.DB.prepare(
    `SELECT comments.score_id, comments.user_id, scores.owner_id FROM comments
     JOIN scores ON scores.id = comments.score_id WHERE comments.id = ?`,
  )
    .bind(commentId)
    .first<{ score_id: string; user_id: string; owner_id: string }>()
  if (!row) throw new HttpError(404, 'comment_not_found', 'That comment no longer exists.')
  if (row.user_id !== userId && row.owner_id !== userId) {
    throw new HttpError(403, 'not_allowed', 'You can only delete your own comments.')
  }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(commentId),
    refreshCommentCount(env, row.score_id),
  ])
  return { scoreId: row.score_id }
}
