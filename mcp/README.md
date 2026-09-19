# GuitarEasy MCP server

Deployed at **https://guitareasy.app/mcp** (Streamable HTTP).
A read-only version that needs no account is at **https://guitareasy.app/mcp/public** (see
[Public endpoint](#public-endpoint)).

A remote [MCP](https://modelcontextprotocol.io) server for GuitarEasy: upload, download, and list
`.atex` (alphaTex) guitar tab files, and open one in an interactive alphaTab player rendered
directly inside a compatible MCP host's chat window (an [MCP Apps](https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp)
UI resource).

> **Claude Code does not render MCP Apps UI resources.** Connecting this server here only
> surfaces the tools' fallback text. To see and play a score inline, connect the deployed server
> from **Claude.ai** or **Claude Desktop** (Settings → Connectors → Add custom connector), or
> another MCP Apps–capable host.

## Layout

- `worker/` — the Cloudflare Worker. It serves three things on `guitareasy.app`:
  - `/mcp`: a stateless MCP server (`agents`'s `createMcpHandler` + `@modelcontextprotocol/server`),
    protected by an OAuth 2.1 authorization server (`@cloudflare/workers-oauth-provider`, with
    dynamic client registration and PKCE) at `/oauth/*` and `/.well-known/oauth-*`.
  - `/api/*`: the website's REST API for sign-in (Google, Apple, emailed one-time codes), cloud
    scores, publishing, ratings, comments, and search.
  - `/oauth/authorize`: the page MCP hosts send users to. It offers the same sign-in options as the
    website, then asks the user to allow access.

  Accounts, scores, ratings, and comments live in D1 (`migrations/`). Workers KV holds OAuth
  grants and short-lived playback sessions. The sign-in flow is ported from GatherEasy.
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

Every tool acts as the signed-in GuitarEasy user.

| Tool | Description |
| --- | --- |
| `get_current_user()` | Show which account the connection is signed in as. |
| `list_atex_files()` | List the built-in scores and the user's saved scores. |
| `upload_atex(name, tex, publish?)` | Save a score to the user's library (256 KB cap). Private unless `publish` is true. |
| `update_atex(id, name?, tex?)` | Rename a saved score or replace its notation (owner only). |
| `delete_atex(id)` | Delete a saved score with its ratings and comments (owner only). |
| `download_atex(id)` | Get the notation of a built-in, own, or published score. |
| `search_scores(query)` | Search built-in, own, and published scores by file name, title, artist, or uploader. |
| `publish_score(id, published?)` | Publish a score, or pass `published: false` to make it private again. |
| `rate_score(id, stars)` | Rate someone else's published score from 1 to 5 stars. |
| `get_score_details(id)` | Show a score's publish status, rating, and comments. |
| `add_comment(id, body)` | Comment on a published score. Anyone signed in can comment, including the owner. |
| `delete_comment(commentId)` | Delete your own comment, or any comment on a score you own. |
| `play_atex({ id } \| { tex, name }, theme?)` | Open a score in the interactive player. `theme` can be `dark`, `light`, or `system`. |

The player widget shows only the tab player. Searching, saving, publishing, rating, and commenting
happen through the tools above, which the assistant calls from the chat.

### Public endpoint

`https://guitareasy.app/mcp/public` needs no sign-in. It offers only `list_atex_files` (built-in
scores), `download_atex`, `search_scores`, `get_score_details`, and `play_atex`, over built-in and
published scores.

Scores uploaded to the old shared, anonymous library in KV can still be opened by id with
`download_atex` and `play_atex`, but are read-only and no longer listed.

## Connect a host

All hosts sign in with OAuth: when the connector is added, the host opens GuitarEasy's sign-in page
(Google, Apple, or an emailed code) and then asks you to allow access. Connections made before
accounts existed must be reconnected once.

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
cd ../worker && npm install
cp .env.example .env                         # development mode: see below
npx wrangler d1 migrations apply guitareasy --local
npm run dev                                  # wrangler dev at http://localhost:8787
```

Then run the website with `npm run dev` in the repository root; Vite proxies `/api` to the worker.
In development mode (`ENVIRONMENT=development`), email sign-in codes are logged and shown in the
sign-in dialog instead of being emailed unless `SMTP_HOST` and `SMTP_FROM` are set in `.env`, and Google/Apple buttons complete immediately with a local
test identity unless real credentials are set in `.env`.

Inspect it with the [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
npx @modelcontextprotocol/inspector
# Connect to http://localhost:8787/mcp (Streamable HTTP)
```

## Deploy

```bash
cd mcp/worker
npx wrangler kv namespace create SCORES_KV   # once — copy the printed id into wrangler.jsonc
npx wrangler d1 create guitareasy            # once — copy the database_id into wrangler.jsonc
npx wrangler d1 migrations apply guitareasy --remote
npx wrangler secret put AUTH_SECRET          # a long random string
npx wrangler secret put GOOGLE_CLIENT_ID     # and GOOGLE_CLIENT_SECRET
npx wrangler secret put APPLE_CLIENT_ID      # and APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY (.p8 PEM)
npx wrangler secret put SMTP_HOST            # and SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM
npm run deploy
```

- **Google**: add `https://guitareasy.app/api/auth/oauth/google/callback` as an authorized redirect
  URI on the OAuth client.
- **Apple**: create a Services ID (the client id) with Sign in with Apple, and register
  `https://guitareasy.app/api/auth/oauth/apple/callback` as its return URL.
- **Email**: sign-in codes are sent over SMTP with the same settings as GatherEasy. Set
  `SMTP_HOST`, `SMTP_FROM`, and usually `SMTP_USERNAME`/`SMTP_PASSWORD` as secrets; `SMTP_PORT`
  defaults to 587 with STARTTLS (465 uses implicit TLS; `SMTP_STARTTLS=0` disables STARTTLS) and
  `SMTP_FROM_NAME` to "GuitarEasy". Workers cannot connect to port 25.

A provider without credentials is hidden from the sign-in options in production.

Routed to `guitareasy.app/mcp*` (see `routes` in `wrangler.jsonc`), on the same Cloudflare account
and zone as the main app's Pages deployment. The worker also claims `/api/*`, `/oauth/*`, and
`/.well-known/oauth-*`. `run_worker_first` lists the same paths and is required:
Cloudflare's default asset routing otherwise claims the whole matched route path space once any
asset falls under it, and 405s non-GET requests (i.e. the actual JSON-RPC calls) to unmatched
sub-paths instead of falling through to the Worker. The player asset rule also lets the Worker add
CORS headers required when ChatGPT loads the module bundle, fonts, and soundfont from its sandbox
iframe. Configuring `routes` disables the `workers.dev`
URL by default (add `"workers_dev": true` to `wrangler.jsonc` to keep both).

Scores are stored in D1 rather than R2: `.atex` files are small plain text (a few KB), and D1
also provides the queries needed for libraries, search, ratings, and comments.
