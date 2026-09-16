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

type ScoreRecord = {
  id: string
  name: string
  tex: string
}

const demoScore: ScoreRecord = { id: 'demo', name: 'Quiet Hours.atex', tex: demoAlphaTex }
const scoreLibraryStorageKey = 'guitareasy-score-library'

function normalizeScoreName(name: string) {
  return name.replace(/\.alphatex$/i, '.atex') || 'Untitled.atex'
}

function createScoreId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `score-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function restoreScoreLibrary() {
  try {
    const saved = JSON.parse(localStorage.getItem(scoreLibraryStorageKey) ?? '[]')
    if (!Array.isArray(saved)) return []
    return saved.filter((score): score is ScoreRecord => (
      typeof score?.id === 'string' && score.id !== demoScore.id &&
      typeof score?.name === 'string' && typeof score?.tex === 'string' && score.tex.trim().length > 0
    )).map((score) => ({ ...score, name: normalizeScoreName(score.name) }))
  } catch {
    return []
  }
}

const scoreLibrary: ScoreRecord[] = [demoScore, ...restoreScoreLibrary()]

type ThemePreference = 'system' | 'light' | 'dark'

const themeStorageKey = 'guitareasy-theme'
const sidebarStorageKey = 'guitareasy-sidebar-collapsed'
const savedTheme = localStorage.getItem(themeStorageKey)
const initialTheme: ThemePreference = savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system'
  ? savedTheme
  : 'system'

document.documentElement.dataset.theme = initialTheme

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <a class="brand" href="/" aria-label="GuitarEasy home">
        <span class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></span>
        <span>GuitarEasy</span>
      </a>
      <div class="topbar-actions">
        <div class="topbar-meta">
          <span class="eyebrow">ALPHATEX PLAYER</span>
          <span class="status-pill"><span class="status-dot"></span>local workspace</span>
        </div>
        <div class="theme-switcher" id="theme-switcher" role="group" aria-label="Colour mode">
          <button class="theme-option" type="button" data-theme-choice="system" aria-label="Use system colour mode" title="Use system colour mode"><span class="theme-icon" aria-hidden="true">◐</span><span class="theme-label">System</span></button>
          <button class="theme-option" type="button" data-theme-choice="light" aria-label="Use light colour mode" title="Use light colour mode"><span class="theme-icon" aria-hidden="true">☼</span><span class="theme-label">Light</span></button>
          <button class="theme-option" type="button" data-theme-choice="dark" aria-label="Use dark colour mode" title="Use dark colour mode"><span class="theme-icon" aria-hidden="true">◑</span><span class="theme-label">Dark</span></button>
        </div>
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
        <aside class="control-panel" id="control-panel" aria-label="File controls">
          <div class="panel-heading">
            <div>
              <p class="section-kicker">source file</p>
              <h2>Bring a score</h2>
            </div>
            <div class="panel-heading-side">
              <div class="tip-block">
                <span class="tip-icon">i</span>
                <p>alphaTex is parsed in your browser. Nothing leaves this workspace.</p>
              </div>
              <span class="file-type">.ATEX</span>
            </div>
          </div>

          <div class="upload-card" id="drop-zone">
            <input id="file-input" type="file" accept=".atex,.tex,.txt,text/plain" />
            <div class="upload-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14.5v3A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5v-3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
            <div class="upload-copy">
              <p class="upload-title">Drop an alphaTex file here</p>
              <p class="upload-hint">or <label for="file-input">browse your files</label></p>
            </div>
            <p class="upload-formats">.atex · .tex · .txt</p>
          </div>

          <div class="score-library" aria-label="Score library">
            <div class="library-heading">
              <div>
                <p class="section-kicker">score library</p>
                <strong id="score-count">1 score</strong>
              </div>
              <span class="library-type">LOCAL</span>
            </div>
            <div class="score-list" id="score-list"></div>
          </div>

        </aside>

        <section class="score-panel" aria-labelledby="score-heading">
          <div class="score-toolbar">
            <div>
              <p class="section-kicker">notation preview</p>
              <h2 id="score-heading">Your score</h2>
            </div>
            <div class="score-toolbar-actions">
              <button class="sidebar-toggle" id="sidebar-toggle" type="button" aria-controls="control-panel" aria-expanded="true" title="Collapse file controls">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
                <span>Controls</span>
              </button>
              <div class="render-state" id="render-state"><span class="state-dot"></span><span id="render-state-label">ready to render</span></div>
            </div>
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

      <footer class="footer-note"><span>alphaTab renderer</span><span class="footer-line"></span><span>browser MIDI synthesis</span><span class="footer-line"></span><span>© GuitarEasy.app</span></footer>
    </main>
  </div>
`

const notationViewport = document.querySelector<HTMLDivElement>('#notation-viewport')!
const notationCanvas = document.querySelector<HTMLDivElement>('#notation-canvas')!
const notationEmpty = document.querySelector<HTMLDivElement>('#notation-empty')!
const fileInput = document.querySelector<HTMLInputElement>('#file-input')!
const dropZone = document.querySelector<HTMLDivElement>('#drop-zone')!
const scoreList = document.querySelector<HTMLDivElement>('#score-list')!
const scoreCount = document.querySelector<HTMLElement>('#score-count')!
const playPause = document.querySelector<HTMLButtonElement>('#play-pause')!
const stop = document.querySelector<HTMLButtonElement>('#stop')!
const renderState = document.querySelector<HTMLDivElement>('#render-state')!
const renderStateLabel = document.querySelector<HTMLSpanElement>('#render-state-label')!
const scoreError = document.querySelector<HTMLDivElement>('#score-error')!
const songTitle = document.querySelector<HTMLElement>('#song-title')!
const songArtist = document.querySelector<HTMLElement>('#song-artist')!
const songPosition = document.querySelector<HTMLElement>('#song-position')!
const progressFill = document.querySelector<HTMLSpanElement>('#progress-fill')!
const themeSwitcher = document.querySelector<HTMLDivElement>('#theme-switcher')!
const themeOptions = Array.from(themeSwitcher.querySelectorAll<HTMLButtonElement>('[data-theme-choice]'))
const sidebarToggle = document.querySelector<HTMLButtonElement>('#sidebar-toggle')!
const studioGrid = document.querySelector<HTMLElement>('.studio-grid')!

let api: alphaTab.AlphaTabApi
let loadedName = demoScore.name
let activeScoreId = demoScore.id
let isPlayerReady = false
let themePreference = initialTheme

function getResolvedTheme() {
  if (themePreference !== 'system') return themePreference
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function getNotationPalette(theme: 'light' | 'dark') {
  return theme === 'dark'
    ? {
        staffLineColor: '#707785',
        barSeparatorColor: '#d9dde3',
        barNumberColor: '#b7adff',
        mainGlyphColor: '#eef1f0',
        secondaryGlyphColor: 'rgba(238, 241, 240, 0.48)',
        scoreInfoColor: '#eef1f0',
      }
    : {
        staffLineColor: '#a5a5a5',
        barSeparatorColor: '#222211',
        barNumberColor: '#c80000',
        mainGlyphColor: '#1d2029',
        secondaryGlyphColor: 'rgba(29, 32, 41, 0.42)',
        scoreInfoColor: '#1d2029',
      }
}

function applyNotationTheme() {
  if (!api) return
  const palette = getNotationPalette(getResolvedTheme())
  const resources = api.settings.display.resources
  resources.staffLineColor = alphaTab.model.Color.fromJson(palette.staffLineColor)!
  resources.barSeparatorColor = alphaTab.model.Color.fromJson(palette.barSeparatorColor)!
  resources.barNumberColor = alphaTab.model.Color.fromJson(palette.barNumberColor)!
  resources.mainGlyphColor = alphaTab.model.Color.fromJson(palette.mainGlyphColor)!
  resources.secondaryGlyphColor = alphaTab.model.Color.fromJson(palette.secondaryGlyphColor)!
  resources.scoreInfoColor = alphaTab.model.Color.fromJson(palette.scoreInfoColor)!
  api.updateSettings()
  if (api.score) api.render({ reuseViewport: true })
}

function updateThemeColor() {
  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (themeColor) themeColor.content = getResolvedTheme() === 'light' ? '#f2f3f1' : '#11131a'
}

function applyTheme(theme: ThemePreference) {
  themePreference = theme
  document.documentElement.dataset.theme = theme
  themeOptions.forEach((option) => {
    const isSelected = option.dataset.themeChoice === theme
    option.classList.toggle('is-selected', isSelected)
    option.setAttribute('aria-pressed', String(isSelected))
  })
  localStorage.setItem(themeStorageKey, theme)
  updateThemeColor()
  applyNotationTheme()
}

function applySidebarState(collapsed: boolean) {
  studioGrid.classList.toggle('is-sidebar-collapsed', collapsed)
  sidebarToggle.setAttribute('aria-expanded', String(!collapsed))
  sidebarToggle.title = collapsed ? 'Show file controls' : 'Collapse file controls'
  sidebarToggle.querySelector('span')!.textContent = collapsed ? 'Show controls' : 'Controls'
}

function persistScoreLibrary() {
  try {
    localStorage.setItem(scoreLibraryStorageKey, JSON.stringify(scoreLibrary.filter((score) => score.id !== demoScore.id)))
  } catch {
    // A full or restricted browser store should not prevent score playback.
  }
}

function renderScoreLibrary() {
  scoreList.replaceChildren()
  scoreCount.textContent = `${scoreLibrary.length} ${scoreLibrary.length === 1 ? 'score' : 'scores'}`

  scoreLibrary.forEach((score) => {
    const row = document.createElement('div')
    row.className = 'score-list-row'

    const selectButton = document.createElement('button')
    selectButton.type = 'button'
    selectButton.className = 'score-item'
    selectButton.classList.toggle('is-selected', score.id === activeScoreId)
    selectButton.setAttribute('aria-pressed', String(score.id === activeScoreId))
    selectButton.title = `Load ${score.name}`

    const badge = document.createElement('span')
    badge.className = 'score-item-badge'
    badge.textContent = 'ATEX'

    const copy = document.createElement('span')
    copy.className = 'score-item-copy'
    const title = document.createElement('strong')
    title.textContent = score.name
    const meta = document.createElement('small')
    meta.textContent = score.id === demoScore.id ? 'demo score' : 'uploaded score'
    copy.append(title, meta)

    const marker = document.createElement('span')
    marker.className = 'score-item-marker'
    marker.setAttribute('aria-hidden', 'true')
    marker.textContent = score.id === activeScoreId ? '✓' : ''

    selectButton.append(badge, copy, marker)
    selectButton.addEventListener('click', () => loadScore(score.id))
    row.append(selectButton)

    if (score.id !== demoScore.id) {
      const removeButton = document.createElement('button')
      removeButton.type = 'button'
      removeButton.className = 'score-remove'
      removeButton.setAttribute('aria-label', `Remove ${score.name}`)
      removeButton.title = `Remove ${score.name}`
      removeButton.textContent = '×'
      removeButton.addEventListener('click', () => removeScore(score.id))
      row.append(removeButton)
    }

    scoreList.append(row)
  })
}

function addScore(name: string, tex: string) {
  const score = { id: createScoreId(), name: normalizeScoreName(name), tex }
  scoreLibrary.unshift(score)
  persistScoreLibrary()
  renderScoreLibrary()
  return score
}

function removeScore(scoreId: string) {
  const index = scoreLibrary.findIndex((score) => score.id === scoreId)
  if (index < 0 || scoreLibrary[index].id === demoScore.id) return
  scoreLibrary.splice(index, 1)
  persistScoreLibrary()
  if (activeScoreId === scoreId) loadScore(demoScore.id)
  else renderScoreLibrary()
}

function loadScore(scoreId: string) {
  const score = scoreLibrary.find((item) => item.id === scoreId)
  if (score) loadTex(score.tex, score.name, score.id)
}

applyTheme(initialTheme)
applySidebarState(localStorage.getItem(sidebarStorageKey) === 'true')
renderScoreLibrary()

themeSwitcher.addEventListener('click', (event) => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-theme-choice]')
  const nextTheme = target?.dataset.themeChoice
  if (nextTheme === 'system' || nextTheme === 'light' || nextTheme === 'dark') applyTheme(nextTheme)
})

sidebarToggle.addEventListener('click', () => {
  const collapsed = !studioGrid.classList.contains('is-sidebar-collapsed')
  applySidebarState(collapsed)
  localStorage.setItem(sidebarStorageKey, String(collapsed))
})

const colorSchemeQuery = window.matchMedia('(prefers-color-scheme: light)')
colorSchemeQuery.addEventListener('change', () => {
  if (themePreference === 'system') {
    updateThemeColor()
    applyNotationTheme()
  }
})

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

function updatePlayButton(state: alphaTab.synth.PlayerState) {
  const isPlaying = state === alphaTab.synth.PlayerState.Playing
  playPause.classList.toggle('is-playing', isPlaying)
  playPause.setAttribute('aria-label', isPlaying ? 'Pause score' : 'Play score')
  playPause.title = isPlaying ? 'Pause score' : 'Play score'
}

function loadTex(tex: string, name = loadedName, scoreId = activeScoreId) {
  hideError()
  setRenderState('rendering score', 'loading')
  isPlayerReady = false
  activeScoreId = scoreId
  playPause.disabled = true
  stop.disabled = true
  progressFill.style.width = '0%'
  songPosition.textContent = '00:00 / 00:00'
  notationEmpty.hidden = true
  notationCanvas.hidden = false
  loadedName = name
  renderScoreLibrary()

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
    const score = addScore(file.name, tex)
    loadTex(score.tex, score.name, score.id)
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
    resources: getNotationPalette(getResolvedTheme()),
  },
  player: {
    enablePlayer: true,
    enableCursor: true,
    enableAnimatedBeatCursor: true,
    enableElementHighlighting: true,
    soundFont: '/soundfont/sonivox.sf2',
    scrollElement: notationViewport,
    scrollMode: alphaTab.ScrollMode.OffScreen,
    scrollOffsetY: -24,
    scrollSpeed: 420,
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
api.playerStateChanged.on((event) => {
  updatePlayButton(event.state)
  if (event.state === alphaTab.synth.PlayerState.Playing) {
    setRenderState('playing now')
  } else if (isPlayerReady) {
    setRenderState('ready')
  }
})
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
        loadScore(demoScore.id)
        return { title: 'Quiet Hours', filename: demoScore.name, status: 'loaded' }
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

loadScore(demoScore.id)
