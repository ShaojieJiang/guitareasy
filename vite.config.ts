import { defineConfig } from 'vite'
import { alphaTab } from '@coderline/alphatab-vite'

export default defineConfig({
  plugins: [alphaTab()],
  server: {
    port: 65432,
    // The worker's PUBLIC_ORIGIN and OAuth redirect URIs name this port, so
    // fail instead of silently moving to another one.
    strictPort: true,
    // Accounts, cloud scores, and community features are served by the
    // worker in mcp/worker; `npm run dev` starts it alongside Vite. Proxying
    // keeps the session cookie first-party, exactly as on guitareasy.app.
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
})
