import { defineConfig } from 'vite'
import { alphaTab } from '@coderline/alphatab-vite'

export default defineConfig({
  plugins: [alphaTab()],
  // Namespaced under /mcp-app/ (not /mcp/) so these static assets don't
  // collide with the JSON-RPC endpoint at the exact path /mcp — Cloudflare's
  // static-asset layer intercepts any path matching a stored asset
  // directory before the Worker even runs, so /mcp/* here would shadow the
  // /mcp endpoint itself. Also avoids colliding with the main GuitarEasy
  // app's own /font/, /soundfont/, /assets/ paths on the shared domain.
  base: '/mcp-app/',
  server: {
    port: 65433,
  },
})
