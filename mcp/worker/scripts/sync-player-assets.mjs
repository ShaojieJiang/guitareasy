// Copies the built player UI (mcp/app/dist) into ./public/mcp-app/ (not
// ./public/mcp/) so the static assets don't collide with the JSON-RPC
// endpoint at the exact path /mcp, and don't collide with the main
// GuitarEasy app's own /font/, /soundfont/, /assets/ paths when both share
// the guitareasy.app domain.
//
// Hashed files under assets/ are kept across syncs rather than wiped. ChatGPT
// snapshots the widget HTML for a resource URI, so a cached template can still
// reference a previous build's bundle; deleting it leaves the widget stuck on
// its loading placeholder. Content-hashed names make keeping them safe.
import { cp, mkdir, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const sourceDir = path.resolve(here, '../../app/dist')
const targetDir = path.resolve(here, '../public/mcp-app')

await mkdir(targetDir, { recursive: true })
for (const entry of await readdir(targetDir)) {
  if (entry !== 'assets') await rm(path.join(targetDir, entry), { recursive: true, force: true })
}
await cp(sourceDir, targetDir, { recursive: true })
console.log(`Synced player assets into ${path.relative(process.cwd(), targetDir)}`)
