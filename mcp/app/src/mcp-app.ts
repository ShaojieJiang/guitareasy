import * as alphaTab from '@coderline/alphatab'
import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from '@modelcontextprotocol/ext-apps'
import type { CallToolResult } from '@modelcontextprotocol/client'
import './mcp-app.css'

const root = document.getElementById('app')!
root.innerHTML = `
  <div class="player">
    <div class="player-header">
      <h1 id="song-title">GuitarEasy player</h1>
      <span id="song-artist"></span>
    </div>
    <div class="player-status" id="status">Waiting for a score…</div>
    <div class="notation-viewport" id="notation-viewport">
      <div id="notation-canvas"></div>
    </div>
    <div class="player-bar" id="player-bar" hidden>
      <button id="play-pause" type="button" aria-label="Play or pause" disabled>▶</button>
      <button id="stop" class="is-secondary" type="button" aria-label="Stop" disabled>■</button>
      <div class="player-progress"><div class="player-progress-fill" id="progress-fill"></div></div>
      <span class="player-time" id="position">00:00 / 00:00</span>
    </div>
  </div>
`

const songTitle = document.getElementById('song-title')!
const songArtist = document.getElementById('song-artist')!
const status = document.getElementById('status')!
const notationCanvas = document.getElementById('notation-canvas')!
const notationViewport = document.getElementById('notation-viewport')!
const playerBar = document.getElementById('player-bar')!
const playPauseButton = document.getElementById('play-pause') as HTMLButtonElement
const stopButton = document.getElementById('stop') as HTMLButtonElement
const progressFill = document.getElementById('progress-fill')!
const position = document.getElementById('position')!

let isPlayerReady = false

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function setStatus(text: string) {
  status.textContent = text
}

const api = new alphaTab.AlphaTabApi(notationCanvas, {
  core: {
    tex: true,
    fontDirectory: '/mcp-app/font/',
  },
  display: {
    layoutMode: alphaTab.LayoutMode.Page,
    scale: 0.9,
    staveProfile: alphaTab.StaveProfile.Tab,
  },
  player: {
    enablePlayer: true,
    enableCursor: true,
    enableAnimatedBeatCursor: true,
    enableElementHighlighting: true,
    soundFont: '/mcp-app/soundfont/sonivox.sf2',
    scrollElement: notationViewport,
    scrollMode: alphaTab.ScrollMode.OffScreen,
    scrollOffsetY: -24,
  },
})

api.renderStarted.on(() => setStatus('Rendering score…'))
api.renderFinished.on(() => setStatus(isPlayerReady ? 'Ready to play.' : 'Loading sound font…'))
api.scoreLoaded.on((score) => {
  songTitle.textContent = score.title || songTitle.textContent
  songArtist.textContent = score.artist ? `· ${score.artist}` : ''
  playerBar.hidden = false
})
api.error.on((error) => {
  setStatus(error.message || 'alphaTab could not render this score.')
})
api.soundFontLoad.on((event) => {
  const percentage = event.total > 0 ? Math.floor((event.loaded / event.total) * 100) : 0
  setStatus(`Loading sound font… ${percentage}%`)
})
api.playerReady.on(() => {
  isPlayerReady = true
  playPauseButton.disabled = false
  stopButton.disabled = false
  setStatus('Ready to play.')
})
api.playerStateChanged.on((event) => {
  const isPlaying = event.state === alphaTab.synth.PlayerState.Playing
  playPauseButton.textContent = isPlaying ? '⏸' : '▶'
  setStatus(isPlaying ? 'Playing…' : 'Ready to play.')
})
api.playerPositionChanged.on((event) => {
  position.textContent = `${formatDuration(event.currentTime)} / ${formatDuration(event.endTime)}`
  const percentage = event.endTime > 0 ? (event.currentTime / event.endTime) * 100 : 0
  ;(progressFill as HTMLElement).style.width = `${Math.min(100, Math.max(0, percentage))}%`
})

playPauseButton.addEventListener('click', () => {
  if (isPlayerReady) api.playPause()
})
stopButton.addEventListener('click', () => {
  if (isPlayerReady) {
    api.stop()
    ;(progressFill as HTMLElement).style.width = '0%'
    position.textContent = '00:00 / 00:00'
  }
})
document.addEventListener('keydown', (event) => {
  if (event.code === 'Space' && isPlayerReady) {
    event.preventDefault()
    api.playPause()
  }
})

function extractScore(result: CallToolResult): { name: string; tex: string } | undefined {
  const data = result.structuredContent as { name?: string; tex?: string } | undefined
  if (!data?.tex) return undefined
  return { name: data.name ?? 'Untitled.atex', tex: data.tex }
}

function loadScore(name: string, tex: string) {
  songTitle.textContent = name
  setStatus('Rendering score…')
  api.tex(tex)
}

function handleHostContextChanged(ctx: McpUiHostContext) {
  if (ctx.theme) applyDocumentTheme(ctx.theme)
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables)
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts)
}

const app = new App({ name: 'GuitarEasy player', version: '1.0.0' })

app.ontoolresult = (result) => {
  const score = extractScore(result)
  if (score) loadScore(score.name, score.tex)
  else setStatus('No score data received from the tool call.')
}
app.onhostcontextchanged = handleHostContextChanged
app.onerror = (error) => setStatus(error instanceof Error ? error.message : 'An error occurred.')

app.connect().then(() => {
  const ctx = app.getHostContext()
  if (ctx) handleHostContextChanged(ctx)
})
