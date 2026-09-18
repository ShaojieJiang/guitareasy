import { createMcpHandler } from 'agents/mcp/server'
import { createServer, type Env } from './server'

// `env` (KV/assets bindings) is only available inside the Workers `fetch`
// handler, not at module scope, so the MCP handler is built fresh per
// request — matching "stateless" createMcpHandler's own per-request factory
// design (McpRequestContext carries `requestInfo`/`era`/`authInfo`, not env).
export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const handler = createMcpHandler((mcpContext) => createServer(env, mcpContext.requestInfo))
    return handler(request, env, ctx)
  },
} satisfies ExportedHandler<Env>
