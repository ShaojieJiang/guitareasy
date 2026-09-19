# GuitarEasy MCP server

Deployed at **https://guitareasy.app/mcp** (Streamable HTTP).

A remote [MCP](https://modelcontextprotocol.io) server for GuitarEasy: upload, download, and list
`.atex` (alphaTex) guitar tab files, and open one in an interactive alphaTab player rendered
directly inside a compatible MCP host's chat window (an [MCP Apps](https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp)
UI resource).

> **Claude Code does not render MCP Apps UI resources.** Connecting this server here only
> surfaces the tools' fallback text. To see and play a score inline, connect the deployed server
> from **Claude.ai** or **Claude Desktop** (Settings → Connectors → Add custom connector), or
> another MCP Apps–capable host.

## Layout

- `worker/` — the Cloudflare Worker: a stateless MCP server (`agents`'s `createMcpHandler` +
  `@modelcontextprotocol/server`) exposing `upload_atex`, `download_atex`, `list_atex_files`, and
  `play_atex` (the MCP-App-linked tool), backed by Workers KV.
- `app/` — a standalone Vite project that builds the alphaTab player UI shown inside the host's
  iframe. Reuses the same `@coderline/alphatab-vite` plugin as the main GuitarEasy app. The widget
  nests a second, first-party `guitareasy.app` frame (the "bridge") inside the host's own widget
  frame and forwards the tool result into it; alphaTab renders and plays there, using the legacy
  ScriptProcessor audio output (`PlayerOutputMode.WebAudioScriptProcessor`) instead of AudioWorklets,
  since a worklet's separate module-loading step is more likely to be blocked by a host-inherited
  CSP than ordinary script/fetch. This plays inline in the widget on hosts that allow it. If the
  synth still never becomes ready within a few seconds (a host whose sandbox blocks audio even in
  the nested frame), the widget falls back to asking the host to open the score as a first-party
  `guitareasy.app` page instead, via a short-lived playback session URL. Assets are namespaced under
  `/mcp-app/*` — deliberately not `/mcp/*`, which would collide with the JSON-RPC endpoint at
  `/mcp`, or with the main app's own `/font/`, `/soundfont/`, and `/assets/` paths on the shared
  domain.
- `desktop-extension/` — a [Claude Desktop Extension](desktop-extension/README.md) (`.mcpb`) that
  bundles a local proxy pointed at the deployed server, for one-click install in Claude Desktop.

## Tools

| Tool | Description |
| --- | --- |
| `upload_atex(name, tex)` | Store a score (256 KB cap, no auth). Returns `{ id, name }`. |
| `download_atex(id)` | Retrieve a stored score's alphaTex source by id. |
| `list_atex_files()` | List bundled + uploaded scores (id, name, size, uploaded date). |
| `play_atex({ id } \| { tex, name }, theme?)` | Open a stored or inline score in the interactive player. `theme` can be `dark`, `light`, or `system`; use `dark` to force dark mode. |

The server is seeded on first use with the same three bundled scores as the main app (*Canon in
D*, *Game of Thrones Theme*, *Spanish Romance*), so `list_atex_files`/`play_atex` work without any
upload first.

## Connect a host

**Claude.ai / Claude Desktop** — Settings → Connectors → Add custom connector → enter
`https://guitareasy.app/mcp`. Renders the interactive player inline (MCP Apps support). For a
one-click local install instead, use the [Desktop Extension](desktop-extension/README.md)
(`.mcpb`) — install it from `mcp/desktop-extension/dist/guitareasy.mcpb` after building it there.

**ChatGPT** — Settings → Security and login → enable **Developer mode**, then go to
ChatGPT Plugins → **+** → enter a name/description → under Connection enter
`https://guitareasy.app/mcp` (including the `/mcp` path) → create, then review the discovered
tools. This is OpenAI's current Apps SDK connection flow for personal/dev use — no manifest or
submission needed. (The legacy 2023 "ChatGPT plugin" `ai-plugin.json`/OpenAPI format this
superseded is retired.) A public App Store listing is a separate, much larger path requiring
OpenAI review, branding assets, and a privacy policy — not set up here. Developer mode
availability can depend on account/workspace policy. After deploying a tool descriptor or UI
resource change, open **Settings → Plugins → GuitarEasy → Manage → Refresh** before testing in a
new chat. ChatGPT snapshots the template used by an existing response, so old widget cards do not
adopt a newer resource URI or bundle after deployment.

**Claude Code** — connects and can call the tools, but per the caveat above won't render the
player inline; only the tools' fallback text.

## Local development

```bash
cd mcp/app && npm install && npm run build   # builds the player UI into app/dist
cd ../worker && npm install && npm run dev   # wrangler dev, served at http://localhost:8787/mcp
```

Inspect it with the [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
npx @modelcontextprotocol/inspector
# Connect to http://localhost:8787/mcp (Streamable HTTP)
```

## Deploy

```bash
cd mcp/worker
npx wrangler kv namespace create SCORES_KV   # once — copy the printed id into wrangler.jsonc
npm run deploy
```

Routed to `guitareasy.app/mcp*` (see `routes` in `wrangler.jsonc`), on the same Cloudflare account
and zone as the main app's Pages deployment. `run_worker_first: ["/mcp", "/mcp-app/*"]` is required there:
Cloudflare's default asset routing otherwise claims the whole matched route path space once any
asset falls under it, and 405s non-GET requests (i.e. the actual JSON-RPC calls) to unmatched
sub-paths instead of falling through to the Worker. The player asset rule also lets the Worker add
CORS headers required when ChatGPT loads the module bundle, fonts, and soundfont from its sandbox
iframe. Configuring `routes` disables the `workers.dev`
URL by default (add `"workers_dev": true` to `wrangler.jsonc` to keep both).

Storage uses Workers KV rather than R2, since `.atex` files are small plain text and KV needed no
extra account permissions beyond what was already granted.
