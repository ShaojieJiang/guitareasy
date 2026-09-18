// Copies the built player UI (mcp/app/dist) into ./public/mcp-app/ (not
// ./public/mcp/) so the static assets don't collide with the JSON-RPC
// endpoint at the exact path /mcp, and don't collide with the main
// GuitarEasy app's own /font/, /soundfont/, /assets/ paths when both share
// the guitareasy.app domain.
import { cp, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const sourceDir = path.resolve(here, '../../app/dist')
const targetDir = path.resolve(here, '../public/mcp-app')

await rm(targetDir, { recursive: true, force: true })
await mkdir(path.dirname(targetDir), { recursive: true })
await cp(sourceDir, targetDir, { recursive: true })
console.log(`Synced player assets into ${path.relative(process.cwd(), targetDir)}`)
