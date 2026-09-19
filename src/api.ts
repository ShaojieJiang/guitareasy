// Client for the GuitarEasy REST API served by the worker under /api on the
// same origin, so the HttpOnly session cookie is sent automatically.

export type User = { id: string; email: string; displayName: string }

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

export type CloudScore = ScoreSummary & { tex: string }

export type Comment = {
  id: string
  body: string
  author: { id: string; displayName: string }
  isAuthor: boolean
  canDelete: boolean
  createdAt: string
}

export type Providers = { oauth: Array<'google' | 'apple'>; email: boolean }

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'network', 'GuitarEasy could not be reached. Check your connection.')
  }
  const data = (await response.json().catch(() => undefined)) as
    | (T & { error?: { code?: string; message?: string } })
    | undefined
  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.error?.code ?? 'request_failed',
      data?.error?.message ?? 'Something went wrong. Try again.',
    )
  }
  return data as T
}

export const api = {
  providers: () => request<Providers>('GET', '/api/auth/providers'),
  me: () => request<{ user: User | null }>('GET', '/api/me').then((data) => data.user),
  updateDisplayName: (displayName: string) =>
    request<{ user: User }>('PATCH', '/api/me', { displayName }).then((data) => data.user),
  startEmail: (email: string) =>
    request<{ challengeId: string; debugCode?: string }>('POST', '/api/auth/email/start', { email }),
  verifyEmail: (challengeId: string, code: string) =>
    request<{ user: User }>('POST', '/api/auth/email/verify', { challengeId, code }).then((data) => data.user),
  oauthStartUrl: (provider: 'google' | 'apple', returnTo: string) =>
    `/api/auth/oauth/${provider}/start?returnTo=${encodeURIComponent(returnTo)}`,
  logout: () => request<{ ok: true }>('POST', '/api/auth/logout'),

  listScores: () => request<{ scores: ScoreSummary[] }>('GET', '/api/scores').then((data) => data.scores),
  getScore: (id: string) => request<{ score: CloudScore }>('GET', `/api/scores/${id}`).then((data) => data.score),
  createScore: (name: string, tex: string) =>
    request<{ score: CloudScore }>('POST', '/api/scores', { name, tex }).then((data) => data.score),
  importScores: (scores: Array<{ clientId: string; name: string; tex: string }>) =>
    request<{
      imported: Array<{ clientId: string; score: ScoreSummary }>
      failed: Array<{ clientId: string; message: string }>
    }>('POST', '/api/scores/import', { scores }),
  setPublished: (id: string, published: boolean) =>
    request<{ score: CloudScore }>('PATCH', `/api/scores/${id}`, { published }).then((data) => data.score),
  deleteScore: (id: string) => request<{ ok: true }>('DELETE', `/api/scores/${id}`),
  search: (query: string) =>
    request<{ scores: ScoreSummary[] }>('GET', `/api/scores/search?q=${encodeURIComponent(query)}`).then(
      (data) => data.scores,
    ),
  rate: (id: string, stars: number) =>
    request<{ score: ScoreSummary }>('PUT', `/api/scores/${id}/rating`, { stars }).then((data) => data.score),
  comments: (id: string) =>
    request<{ comments: Comment[] }>('GET', `/api/scores/${id}/comments`).then((data) => data.comments),
  addComment: (id: string, body: string) =>
    request<{ comment: Comment }>('POST', `/api/scores/${id}/comments`, { body }).then((data) => data.comment),
  deleteComment: (commentId: string) => request<{ scoreId: string }>('DELETE', `/api/comments/${commentId}`),
}
