import * as alphaTab from '@coderline/alphatab'
import './style.css'

const demoAlphaTex = String.raw`\\title "Quiet Hours"
\\subtitle "A short picking study"
\\tempo 92
.
:4 0.6 1.5 2.5 2.4 | 3.5 2.3 1.3 0.3 |
:4 0.6 1.5 2.5 2.4 | 3.5 2.3 1.3 0.3 |
:4 0.6 1.5 2.5 2.4 | 3.5 2.3 1.3 0.3 |
:4 0.6 1.5 2.5 2.4 | 3.5 2.3 1.3 0.3 |`

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <a class="brand" href="/" aria-label="guitareasy home">
        <span class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></span>
        <span>guitareasy</span>
      </a>
      <div class="topbar-meta">
        <span class="eyebrow">ALPHATEX PLAYER</span>
        <span class="status-pill"><span class="status-dot"></span>local workspace</span>
      </div>
    </header>

    <main class="workspace">
      <section class="intro-row" aria-labelledby="page-title">
        <div>
          <p class="section-kicker">notation desk / 01</p>
          <h1 id="page-title">Play your TAB.</h1>
          <p class="intro-copy">Drop in an alphaTex file, see the notation, and hear every note through the built-in MIDI player.</p>
        </div>
        <div class="shortcut-note" aria-label="Keyboard shortcut">
          <span class="shortcut-key">SPACE</span>
          <span>play / pause</span>
        </div>
      </section>

      <section class="studio-grid">
        <aside class="control-panel" aria-label="File controls">
          <div class="panel-heading">
            <div>
              <p class="section-kicker">source file</p>
              <h2>Bring a score</h2>
            </div>
            <span class="file-type">.TEX</span>
          </div>

          <div class="upload-card" id="drop-zone">
            <input id="file-input" type="file" accept=".alphatex,.tex,.txt,text/plain" />
            <div class="upload-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14.5v3A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5v-3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
            <div class="upload-copy">
              <p class="upload-title">Drop an alphaTex file here</p>
              <p class="upload-hint">or <label for="file-input">browse your files</label></p>
            </div>
            <p class="upload-formats">.alphatex · .tex · .txt</p>
          </div>

          <div class="loaded-file" id="loaded-file" hidden>
            <div class="file-badge">TEX</div>
            <div class="loaded-file-copy">
              <span class="loaded-label">loaded score</span>
              <strong id="file-name">Quiet Hours.alphatex</strong>
            </div>
            <button class="icon-button" id="clear-file" type="button" aria-label="Clear score" title="Clear score">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
            </button>
          </div>

          <div class="panel-divider"></div>
          <div class="tip-block">
            <span class="tip-icon">i</span>
            <p>alphaTex is parsed in your browser. Nothing leaves this workspace.</p>
          </div>
          <button class="text-button" id="demo-button" type="button">Load the demo score <span aria-hidden="true">↗</span></button>
        </aside>

        <section class="score-panel" aria-labelledby="score-heading">
          <div class="score-toolbar">
            <div>
              <p class="section-kicker">notation preview</p>
              <h2 id="score-heading">Your score</h2>
            </div>
            <div class="render-state" id="render-state"><span class="state-dot"></span><span id="render-state-label">ready to render</span></div>
          </div>
          <div class="notation-viewport" id="notation-viewport">
            <div class="notation-canvas" id="notation-canvas"></div>
            <div class="notation-empty" id="notation-empty" hidden>
              <div class="empty-staff" aria-hidden="true">𝄞</div>
              <p>Upload a score to start reading.</p>
            </div>
          </div>
          <div class="score-error" id="score-error" role="alert" hidden></div>
          <div class="player-bar" aria-label="MIDI player controls">
            <button class="play-button" id="play-pause" type="button" disabled aria-label="Play score">
              <svg class="play-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 6 9 6-9 6V6Z" fill="currentColor"/></svg>
              <svg class="pause-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 6v12M16 6v12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>
            </button>
            <button class="stop-button" id="stop" type="button" disabled aria-label="Stop playback" title="Stop playback">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1.2" fill="currentColor"/></svg>
            </button>
            <div class="player-readout">
              <div class="player-title-row"><strong id="song-title">Quiet Hours</strong><span id="song-artist">· alphaTex score</span></div>
              <div class="progress-track"><span id="progress-fill"></span></div>
            </div>
            <span class="player-time" id="song-position">00:00 / 00:00</span>
          </div>
        </section>
      </section>

      <footer class="footer-note"><span>alphaTab renderer</span><span class="footer-line"></span><span>browser MIDI synthesis</span></footer>
    </main>
  </div>
`

const notationViewport = document.querySelector<HTMLDivElement>('#notation-viewport')!
const notationCanvas = document.querySelector<HTMLDivElement>('#notation-canvas')!
const notationEmpty = document.querySelector<HTMLDivElement>('#notation-empty')!
const fileInput = document.querySelector<HTMLInputElement>('#file-input')!
const dropZone = document.querySelector<HTMLDivElement>('#drop-zone')!
const loadedFile = document.querySelector<HTMLDivElement>('#loaded-file')!
const fileName = document.querySelector<HTMLElement>('#file-name')!
const clearFile = document.querySelector<HTMLButtonElement>('#clear-file')!
const demoButton = document.querySelector<HTMLButtonElement>('#demo-button')!
const playPause = document.querySelector<HTMLButtonElement>('#play-pause')!
const stop = document.querySelector<HTMLButtonElement>('#stop')!
const renderState = document.querySelector<HTMLDivElement>('#render-state')!
const renderStateLabel = document.querySelector<HTMLSpanElement>('#render-state-label')!
const scoreError = document.querySelector<HTMLDivElement>('#score-error')!
const songTitle = document.querySelector<HTMLElement>('#song-title')!
const songArtist = document.querySelector<HTMLElement>('#song-artist')!
const songPosition = document.querySelector<HTMLElement>('#song-position')!
const progressFill = document.querySelector<HTMLSpanElement>('#progress-fill')!

let api: alphaTab.AlphaTabApi
let loadedName = 'Quiet Hours.alphatex'
let isPlayerReady = false

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function setRenderState(label: string, state: 'ready' | 'loading' | 'error' = 'ready') {
  renderState.dataset.state = state
  renderStateLabel.textContent = label
}

function showError(message: string) {
  scoreError.hidden = false
  scoreError.textContent = message
  setRenderState('could not render', 'error')
}

function hideError() {
  scoreError.hidden = true
  scoreError.textContent = ''
}

function setLoadedFile(name: string | null) {
  if (name) {
    loadedName = name
    fileName.textContent = name
    loadedFile.hidden = false
    dropZone.classList.add('has-file')
  } else {
    loadedName = 'Quiet Hours.alphatex'
    fileName.textContent = loadedName
    loadedFile.hidden = true
    dropZone.classList.remove('has-file')
  }
}

function updatePlayButton(state: alphaTab.synth.PlayerState) {
  const isPlaying = state === alphaTab.synth.PlayerState.Playing
  playPause.classList.toggle('is-playing', isPlaying)
  playPause.setAttribute('aria-label', isPlaying ? 'Pause score' : 'Play score')
  playPause.title = isPlaying ? 'Pause score' : 'Play score'
}

function loadTex(tex: string, name = loadedName) {
  hideError()
  setRenderState('rendering score', 'loading')
  isPlayerReady = false
  playPause.disabled = true
  stop.disabled = true
  progressFill.style.width = '0%'
  songPosition.textContent = '00:00 / 00:00'
  notationEmpty.hidden = true
  notationCanvas.hidden = false
  setLoadedFile(name)

  try {
    api.tex(tex)
  } catch {
    showError('This file could not be read as alphaTex. Check the syntax and try again.')
    notationCanvas.hidden = true
    notationEmpty.hidden = false
  }
}

function handleFile(file: File) {
  if (!file) return
  const reader = new FileReader()
  reader.addEventListener('load', () => {
    const tex = typeof reader.result === 'string' ? reader.result.trim() : ''
    if (!tex) {
      showError('That file is empty. Choose an alphaTex file with notation inside.')
      return
    }
    loadTex(tex, file.name)
  })
  reader.addEventListener('error', () => showError('The file could not be opened. Please try another file.'))
  reader.readAsText(file)
}

api = new alphaTab.AlphaTabApi(notationCanvas, {
  core: {
    tex: true,
    fontDirectory: '/font/',
  },
  display: {
    layoutMode: alphaTab.LayoutMode.Page,
    scale: 0.9,
    staveProfile: alphaTab.StaveProfile.Tab,
  },
  player: {
    enablePlayer: true,
    soundFont: '/soundfont/sonivox.sf2',
    scrollElement: notationViewport,
  },
})

api.renderStarted.on(() => setRenderState('rendering score', 'loading'))
api.renderFinished.on(() => setRenderState('ready'))
api.scoreLoaded.on((score) => {
  songTitle.textContent = score.title || loadedName.replace(/\.[^/.]+$/, '')
  songArtist.textContent = score.artist ? `· ${score.artist}` : '· alphaTex score'
  setRenderState('ready')
  notationEmpty.hidden = true
  notationCanvas.hidden = false
})
api.error.on((error) => {
  showError(error.message || 'alphaTab could not render this score.')
  notationCanvas.hidden = true
  notationEmpty.hidden = false
})
api.soundFontLoad.on((event) => {
  const percentage = event.total > 0 ? Math.floor((event.loaded / event.total) * 100) : 0
  setRenderState(`loading soundfont ${percentage}%`, 'loading')
})
api.playerReady.on(() => {
  isPlayerReady = true
  playPause.disabled = false
  stop.disabled = false
  setRenderState('ready')
})
api.playerStateChanged.on((event) => updatePlayButton(event.state))
api.playerPositionChanged.on((event) => {
  songPosition.textContent = `${formatDuration(event.currentTime)} / ${formatDuration(event.endTime)}`
  const percentage = event.endTime > 0 ? (event.currentTime / event.endTime) * 100 : 0
  progressFill.style.width = `${Math.min(100, Math.max(0, percentage))}%`
})

playPause.addEventListener('click', () => {
  if (isPlayerReady) api.playPause()
})
stop.addEventListener('click', () => {
  if (isPlayerReady) {
    api.stop()
    progressFill.style.width = '0%'
    songPosition.textContent = '00:00 / 00:00'
  }
})

fileInput.addEventListener('change', () => {
  const [file] = Array.from(fileInput.files ?? [])
  if (file) handleFile(file)
  fileInput.value = ''
})
dropZone.addEventListener('dragover', (event) => {
  event.preventDefault()
  dropZone.classList.add('is-dragging')
})
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('is-dragging'))
dropZone.addEventListener('drop', (event) => {
  event.preventDefault()
  dropZone.classList.remove('is-dragging')
  const [file] = Array.from(event.dataTransfer?.files ?? [])
  if (file) handleFile(file)
})
clearFile.addEventListener('click', () => loadTex(demoAlphaTex))
demoButton.addEventListener('click', () => loadTex(demoAlphaTex))
document.addEventListener('keydown', (event) => {
  const target = event.target as HTMLElement | null
  if (event.code === 'Space' && target?.tagName !== 'INPUT' && target?.tagName !== 'TEXTAREA' && target?.tagName !== 'BUTTON') {
    event.preventDefault()
    if (isPlayerReady) api.playPause()
  }
})

type WebModelContext = {
  registerTool: (tool: unknown, options?: { signal?: AbortSignal }) => void | Promise<void>
}

const modelContext = typeof document !== 'undefined'
  ? (document as Document & { modelContext?: WebModelContext }).modelContext
  : undefined
if (modelContext?.registerTool) {
  const webMcpLifecycle = new AbortController()
  const registerWebMcpTools = async () => {
    await modelContext.registerTool({
      name: 'load_demo_score',
      title: 'Load demo score',
      description: 'Load the visible Quiet Hours demo alphaTex score into the notation preview.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute() {
        loadTex(demoAlphaTex)
        return { title: 'Quiet Hours', filename: 'Quiet Hours.alphatex', status: 'loaded' }
      },
    }, { signal: webMcpLifecycle.signal })

    await modelContext.registerTool({
      name: 'toggle_midi_playback',
      title: 'Play or pause MIDI',
      description: 'Toggle the visible alphaTab MIDI player between playing and paused states.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute() {
        if (!isPlayerReady) return { status: 'not-ready' }
        api.playPause()
        return { status: api.playerState === alphaTab.synth.PlayerState.Playing ? 'playing' : 'paused' }
      },
    }, { signal: webMcpLifecycle.signal })

    await modelContext.registerTool({
      name: 'read_player_status',
      title: 'Read player status',
      description: 'Read the current score title, loaded file, readiness, playback state, and position.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute() {
        return {
          title: songTitle.textContent,
          filename: loadedName,
          ready: isPlayerReady,
          state: api.playerState === alphaTab.synth.PlayerState.Playing ? 'playing' : 'paused',
          position: songPosition.textContent,
        }
      },
    }, { signal: webMcpLifecycle.signal })
  }
  void registerWebMcpTools().catch(() => webMcpLifecycle.abort())
}

loadTex(demoAlphaTex)
