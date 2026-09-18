// Copies the bundled example scores from the main GuitarEasy app into this
// worker so `src/seed-scores.ts` has a single upstream source of truth.
import { mkdir, readdir, copyFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const sourceDir = path.resolve(here, '../../../src/assets/scores')
const targetDir = path.resolve(here, '../src/seed')

await mkdir(targetDir, { recursive: true })
const files = (await readdir(sourceDir)).filter((file) => file.endsWith('.atex'))
await Promise.all(
  files.map((file) => copyFile(path.join(sourceDir, file), path.join(targetDir, file))),
)
console.log(`Synced ${files.length} seed score(s) into ${path.relative(process.cwd(), targetDir)}`)
