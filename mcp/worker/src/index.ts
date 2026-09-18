import { createMcpHandler } from 'agents/mcp/server'
import { createServer, PLAYER_SESSION_KEY_PREFIX, type Env } from './server'

const PLAYER_ASSET_PREFIX = '/mcp-app/'
const PLAYER_SESSION_PATH_PREFIX = '/mcp-app/session/'

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

// `env` (KV/assets bindings) is only available inside the Workers `fetch`
// handler, not at module scope, so the MCP handler is built fresh per
// request — matching "stateless" createMcpHandler's own per-request factory
// design (McpRequestContext carries `requestInfo`/`era`/`authInfo`, not env).
export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
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

    const handler = createMcpHandler((mcpContext) => createServer(env, mcpContext.requestInfo))
    return handler(request, env, ctx)
  },
} satisfies ExportedHandler<Env>
