// Runs the website (Vite) and the accounts/cloud-score API (the worker in
// mcp/worker) together, since the site proxies /api to the worker. Ctrl+C
// stops both.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workerDir = path.join(root, 'mcp/worker')
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'

if (!existsSync(path.join(workerDir, 'node_modules'))) {
  console.error('mcp/worker dependencies are missing. Run `npm install` in mcp/worker first.')
  process.exit(1)
}
const envPath = path.join(workerDir, '.env')
if (!existsSync(envPath)) {
  console.warn('mcp/worker/.env not found; copy .env.example to use development sign-in settings.')
} else {
  // Wrangler runs dotenv-expand over .env, so an unescaped "$" silently cuts
  // a value short (a password "ab$cd" arrives as "ab").
  const unescaped = readFileSync(envPath, 'utf8')
    .split('\n')
    .map((line) => line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/))
    .filter((match) => match && /(?<!\\)\$/.test(match[2]))
    .map((match) => match[1])
  if (unescaped.length) {
    console.warn(`mcp/worker/.env: escape "$" as "\\$" in ${unescaped.join(', ')}; wrangler would expand it as a variable.`)
  }
}

// Both ports are fixed: OAuth redirect URIs and PUBLIC_ORIGIN name 65432, and
// Vite proxies /api to 8787. Fail early, naming whatever holds them — most
// often an older `npm run dev` still running in another terminal.
function portHolder(port) {
  const result = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpc'], { encoding: 'utf8' })
  if (result.error) return undefined
  const pid = result.stdout.match(/^p(\d+)/m)?.[1]
  const command = result.stdout.match(/^c(.+)/m)?.[1]
  return pid ? `${command ?? 'process'} (PID ${pid})` : undefined
}

async function isPortFree(port) {
  const { createServer } = await import('node:net')
  const check = (host) =>
    new Promise((resolve) => {
      const server = createServer()
      server.once('error', (error) => resolve(error.code !== 'EADDRINUSE'))
      server.listen(port, host, () => server.close(() => resolve(true)))
    })
  // Vite listens on ::1 (localhost) and wrangler on 127.0.0.1; check both.
  return (await check('127.0.0.1')) && (await check('::1'))
}

for (const [port, name] of [[65432, 'the website (Vite)'], [8787, 'the API worker (wrangler)']]) {
  if (!(await isPortFree(port))) {
    const holder = portHolder(port)
    console.error(
      `Port ${port}, needed for ${name}, is already in use${holder ? ` by ${holder}` : ''}.\n` +
        'Stop the other dev server (for example an older `npm run dev` in another terminal) and try again.',
    )
    process.exit(1)
  }
}

function runOnce(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

// The worker bundles the example scores and serves player assets from
// ./public; the website only needs the API, so an empty assets folder is fine.
runOnce(npm, ['run', 'sync-seed-scores'], workerDir)
mkdirSync(path.join(workerDir, 'public'), { recursive: true })
runOnce(npx, ['wrangler', 'd1', 'migrations', 'apply', 'guitareasy', '--local'], workerDir)

const children = [
  spawn(npx, ['wrangler', 'dev', '--port', '8787', '--local-upstream', 'localhost:8787'], {
    cwd: workerDir,
    stdio: 'inherit',
  }),
  spawn(npx, ['vite'], { cwd: root, stdio: 'inherit' }),
]

let stopping = false
function stopAll(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM')
  process.exitCode = code
}
for (const child of children) child.on('exit', (code) => stopAll(code ?? 0))
process.on('SIGINT', () => stopAll(0))
process.on('SIGTERM', () => stopAll(0))
