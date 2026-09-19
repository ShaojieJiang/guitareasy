// REST API for the GuitarEasy website, served under /api on the same origin
// as the site so the session cookie stays first-party.
import {
  availableOAuthProviders,
  clearSessionCookie,
  completeOAuth,
  createSessionCookie,
  destroySession,
  getSessionUser,
  startEmailChallenge,
  startOAuth,
  updateDisplayName,
  verifyEmailChallenge,
} from './auth'
import { publicOrigin, type Env } from './env'
import {
  addComment,
  createScore,
  deleteComment,
  deleteScore,
  getScore,
  importScores,
  listComments,
  listOwnScores,
  rateScore,
  searchScores,
  updateScore,
} from './scores'
import { errorResponse, HttpError, json, readJson } from './util'

type RouteContext = { request: Request; env: Env; params: string[] }
type Route = {
  method: string
  pattern: RegExp
  // Cross-site requests are rejected for every mutating route except the
  // Apple callback, which Apple itself POSTs from appleid.apple.com.
  crossSite?: boolean
  handler: (context: RouteContext) => Promise<Response>
}

async function requireUser(context: RouteContext) {
  const user = await getSessionUser(context.env, context.request)
  if (!user) throw new HttpError(401, 'sign_in_required', 'Sign in to do that.')
  return user
}

const routes: Route[] = [
  {
    method: 'GET',
    pattern: /^\/api\/auth\/providers$/,
    handler: async ({ env }) => json({ oauth: availableOAuthProviders(env), email: true }),
  },
  {
    method: 'POST',
    pattern: /^\/api\/auth\/email\/start$/,
    handler: async ({ request, env }) => {
      const body = await readJson(request)
      return json(await startEmailChallenge(env, request, body.email))
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/auth\/email\/verify$/,
    handler: async ({ request, env }) => {
      const body = await readJson(request)
      const user = await verifyEmailChallenge(env, body.challengeId, body.code)
      return json({ user }, { headers: { 'Set-Cookie': await createSessionCookie(env, request, user.id) } })
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/auth\/oauth\/(google|apple)\/start$/,
    handler: async ({ request, env, params }) =>
      startOAuth(env, request, params[0]!, new URL(request.url).searchParams.get('returnTo')),
  },
  {
    method: 'GET',
    pattern: /^\/api\/auth\/oauth\/(google|apple)\/callback$/,
    handler: async ({ request, env, params }) => completeOAuth(env, request, params[0]!),
  },
  {
    method: 'POST',
    pattern: /^\/api\/auth\/oauth\/(apple)\/callback$/,
    crossSite: true,
    handler: async ({ request, env, params }) => completeOAuth(env, request, params[0]!),
  },
  {
    method: 'POST',
    pattern: /^\/api\/auth\/logout$/,
    handler: async ({ request, env }) => {
      await destroySession(env, request)
      return json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookie(env, request) } })
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/me$/,
    handler: async ({ request, env }) => json({ user: (await getSessionUser(env, request)) ?? null }),
  },
  {
    method: 'PATCH',
    pattern: /^\/api\/me$/,
    handler: async (context) => {
      const user = await requireUser(context)
      const body = await readJson(context.request)
      return json({ user: await updateDisplayName(context.env, user.id, body.displayName) })
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/scores$/,
    handler: async (context) => {
      const user = await requireUser(context)
      return json({ scores: await listOwnScores(context.env, user.id) })
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/scores$/,
    handler: async (context) => {
      const user = await requireUser(context)
      const body = await readJson(context.request)
      return json({ score: await createScore(context.env, user.id, body) }, { status: 201 })
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/scores\/import$/,
    handler: async (context) => {
      const user = await requireUser(context)
      const body = await readJson(context.request)
      return json(await importScores(context.env, user.id, body.scores))
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/scores\/search$/,
    handler: async ({ request, env }) => {
      const user = await getSessionUser(env, request)
      const query = new URL(request.url).searchParams.get('q')
      return json({ scores: await searchScores(env, query, user?.id ?? null) })
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/scores\/([\w-]+)$/,
    handler: async ({ request, env, params }) => {
      const user = await getSessionUser(env, request)
      return json({ score: await getScore(env, params[0]!, user?.id ?? null) })
    },
  },
  {
    method: 'PATCH',
    pattern: /^\/api\/scores\/([\w-]+)$/,
    handler: async (context) => {
      const user = await requireUser(context)
      const body = await readJson(context.request)
      return json({ score: await updateScore(context.env, user.id, context.params[0]!, body) })
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/scores\/([\w-]+)$/,
    handler: async (context) => {
      const user = await requireUser(context)
      await deleteScore(context.env, user.id, context.params[0]!)
      return json({ ok: true })
    },
  },
  {
    method: 'PUT',
    pattern: /^\/api\/scores\/([\w-]+)\/rating$/,
    handler: async (context) => {
      const user = await requireUser(context)
      const body = await readJson(context.request)
      return json({ score: await rateScore(context.env, user.id, context.params[0]!, body.stars) })
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/scores\/([\w-]+)\/comments$/,
    handler: async ({ request, env, params }) => {
      const user = await getSessionUser(env, request)
      return json({ comments: await listComments(env, params[0]!, user?.id ?? null) })
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/scores\/([\w-]+)\/comments$/,
    handler: async (context) => {
      const user = await requireUser(context)
      const body = await readJson(context.request)
      return json({ comment: await addComment(context.env, user.id, context.params[0]!, body.body) }, { status: 201 })
    },
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/comments\/([\w-]+)$/,
    handler: async (context) => {
      const user = await requireUser(context)
      return json(await deleteComment(context.env, user.id, context.params[0]!))
    },
  },
]

// SameSite=Lax already keeps the session cookie off cross-site fetches; the
// Origin check is a second line of defence for every state-changing call.
function isSameOrigin(request: Request, env: Env) {
  const origin = request.headers.get('Origin')
  if (origin) return origin === publicOrigin(env, request) || origin === new URL(request.url).origin
  return request.headers.get('Sec-Fetch-Site') === 'same-origin'
}

export async function handleApi(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url)
  const method = request.method === 'HEAD' ? 'GET' : request.method
  let pathMatched = false
  for (const route of routes) {
    const match = route.pattern.exec(pathname)
    if (!match) continue
    pathMatched = true
    if (route.method !== method) continue
    try {
      if (method !== 'GET' && !route.crossSite && !isSameOrigin(request, env)) {
        throw new HttpError(403, 'cross_site', 'Cross-site requests are not allowed.')
      }
      return await route.handler({ request, env, params: match.slice(1) })
    } catch (error) {
      return errorResponse(error)
    }
  }
  return errorResponse(
    pathMatched
      ? new HttpError(405, 'method_not_allowed', 'Method not allowed.')
      : new HttpError(404, 'not_found', 'Not found.'),
  )
}
