import { OAuthProvider } from '@cloudflare/workers-oauth-provider'
import { createMcpHandler } from 'agents/mcp/server'
import { handleApi } from './api'
import { handleAuthorize } from './authorize'
import type { Env } from './env'
import { createServer, PLAYER_SESSION_KEY_PREFIX } from './server'

const PLAYER_ASSET_PREFIX = '/mcp-app/'
const PLAYER_SESSION_PATH_PREFIX = '/mcp-app/session/'
const AUTHORIZE_PATH = '/oauth/authorize'

async function servePlayerSession(request: Request, env: Env, pathname: string): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } })
  }

  const token = pathname.slice(PLAYER_SESSION_PATH_PREFIX.length)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
    return new Response('Not found', { status: 404 })
  }

  const session = await env.SCORES_KV.get(`${PLAYER_SESSION_KEY_PREFIX}${token}`)
  if (!session) return new Response('Playback session expired or was not found.', { status: 404 })

  return new Response(request.method === 'HEAD' ? null : session, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

function addPlayerAssetCors(response: Response): Response {
  const headers = new Headers(response.headers)
  // MCP Apps run in a host-controlled sandbox origin. Module scripts,
  // workers, worklets, fonts, and the soundfont are fetched cross-origin
  // from guitareasy.app, so the public player assets must opt into CORS.
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  headers.set('Access-Control-Allow-Headers', '*')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

// Everything that is not the MCP endpoint or an OAuth protocol endpoint:
// player assets, the website's REST API, and the MCP sign-in/consent page.
const siteHandler = {
  fetch(request: Request, env: Env) {
    const pathname = new URL(request.url).pathname
    if (pathname.startsWith(PLAYER_SESSION_PATH_PREFIX)) {
      return servePlayerSession(request, env, pathname)
    }
    if (pathname.startsWith(PLAYER_ASSET_PREFIX)) {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': '*',
          },
        })
      }
      return env.ASSETS.fetch(request).then(addPlayerAssetCors)
    }
    if (pathname.startsWith('/api/')) return handleApi(request, env)
    if (pathname === AUTHORIZE_PATH) return handleAuthorize(request, env)
    return new Response('Not found', { status: 404 })
  },
} satisfies ExportedHandler<Env>

// `env` (D1/KV/assets bindings) is only available inside the Workers
// `fetch` handler, not at module scope, so the MCP server is built fresh per
// request — matching createMcpHandler's stateless per-request factory. The
// OAuth provider has already validated the bearer token and placed the
// grant's props (`{ userId }`) on ctx.props by the time this runs.
const mcpHandler = {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const userId = (ctx.props as { userId?: unknown } | undefined)?.userId
    if (typeof userId !== 'string') return new Response('Unauthorized', { status: 401 })
    const handler = createMcpHandler((mcpContext) => createServer(env, mcpContext.requestInfo, userId))
    return handler(request, env, ctx)
  },
} satisfies ExportedHandler<Env>

// MCP clients (Claude, ChatGPT, …) discover the authorization server from
// /.well-known metadata, register dynamically, and send the user through
// /oauth/authorize, which signs them in with the same Google, Apple, or
// email-code options as the website.
const oauthProvider = new OAuthProvider<Env>({
  apiRoute: '/mcp',
  apiHandler: mcpHandler,
  defaultHandler: siteHandler,
  authorizeEndpoint: AUTHORIZE_PATH,
  tokenEndpoint: '/oauth/token',
  clientRegistrationEndpoint: '/oauth/register',
  scopesSupported: ['scores'],
  accessTokenTTL: 60 * 60,
  resourceMetadata: { resource_name: 'GuitarEasy' },
})

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    // The provider matches apiRoute as a path prefix, so "/mcp" would also
    // claim the public "/mcp-app/" player assets. Serve those first.
    if (new URL(request.url).pathname.startsWith(PLAYER_ASSET_PREFIX)) return siteHandler.fetch(request, env)
    return oauthProvider.fetch(request, env, ctx)
  },
} satisfies ExportedHandler<Env>
