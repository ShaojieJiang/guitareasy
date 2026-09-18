import { defineConfig } from 'vite'
import { alphaTab } from '@coderline/alphatab-vite'

export default defineConfig(({ command }) => ({
  plugins: [alphaTab()],
  // Namespaced under /mcp-app/ (not /mcp/) so these static assets don't
  // collide with the JSON-RPC endpoint at the exact path /mcp — Cloudflare's
  // static-asset layer intercepts any path matching a stored asset
  // directory before the Worker even runs, so /mcp/* here would shadow the
  // /mcp endpoint itself. Also avoids colliding with the main GuitarEasy
  // app's own /font/, /soundfont/, /assets/ paths on the shared domain.
  // Production widgets execute on a ChatGPT sandbox origin. Emit absolute
  // URLs in the built HTML so the bundle can never resolve against that
  // sandbox, even if a host ignores or rewrites <base>.
  base: command === 'build' ? 'https://guitareasy.app/mcp-app/' : '/mcp-app/',
  server: {
    port: 65433,
  },
}))
