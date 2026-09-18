# GuitarEasy Claude Desktop Extension

A [Claude Desktop Extension](https://www.claude.com/blog/claude-extensions) (`.mcpb`) that connects
Claude Desktop to the [GuitarEasy MCP server](../README.md) at `https://guitareasy.app/mcp`.

The `.mcpb` format only supports bundling a local process (`node`/`python`/`binary`), not a remote
URL directly, so this bundles [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) — a stdio↔HTTP
proxy — pre-configured to connect to the deployed server. No score data is stored on your machine;
this only bridges the connection.

## Build

```bash
cd mcp/desktop-extension
npm install          # installs mcp-remote (bundled) and the mcpb CLI (dev-only, not bundled)
npm run validate      # checks manifest.json against the MCPB schema
npm run pack          # writes dist/guitareasy.mcpb
```

## Install

Double-click (or drag onto the Claude Desktop window) `dist/guitareasy.mcpb`. Claude Desktop shows
an install prompt with the extension's name, description, and the command it will run — confirm to
enable it, no directory submission required.

## Update the server URL

If the MCP server ever moves, update the URL in `manifest.json`'s `server.mcp_config.args` and
rebuild — there's no separate config step for the end user.
