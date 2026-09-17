import * as alphaTab from '@coderline/alphatab'
import './style.css'

type ScoreRecord = {
  id: string
  name: string
  tex: string
}

const bundledScoreSources = import.meta.glob('./assets/scores/*.atex', {
  eager: true,
  import: 'default',
  query: '?raw',
}) as Record<string, string>

function getFileName(path: string) {
  return path.split('/').pop() ?? 'Untitled.atex'
}

const bundledScores: ScoreRecord[] = Object.entries(bundledScoreSources)
  .map(([path, tex]) => ({
    id: `bundled:${path}`,
    name: getFileName(path),
    tex,
  }))
  .sort((left, right) => left.name.localeCompare(right.name))
const defaultScore = bundledScores[0]!
const bundledScoreIds = new Set(bundledScores.map((score) => score.id))
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
      typeof score?.id === 'string' && !bundledScoreIds.has(score.id) &&
      typeof score?.name === 'string' && typeof score?.tex === 'string' && score.tex.trim().length > 0
    )).map((score) => ({ ...score, name: normalizeScoreName(score.name) }))
  } catch {
    return []
  }
}

const scoreLibrary: ScoreRecord[] = [...bundledScores, ...restoreScoreLibrary()]

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
        <img class="brand-mark" src="/favicon.svg" alt="" aria-hidden="true" />
        <span>GuitarEasy</span>
      </a>
      <div class="topbar-actions">
        <div class="topbar-meta">
          <a class="github-button" href="https://github.com/ShaojieJiang/guitareasy" target="_blank" rel="noreferrer" aria-label="View GuitarEasy on GitHub" title="View GuitarEasy on GitHub">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .7a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.04c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.74.08-.74 1.2.09 1.84 1.23 1.84 1.23 1.07 1.83 2.8 1.3 3.48.99.11-.77.42-1.3.76-1.6-2.67-.3-5.47-1.34-5.47-5.95 0-1.31.47-2.38 1.23-3.22-.12-.3-.53-1.52.12-3.17 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.29-1.23 3.29-1.23.65 1.65.24 2.87.12 3.17.77.84 1.23 1.91 1.23 3.22 0 4.62-2.81 5.64-5.49 5.94.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.57A12 12 0 0 0 12 .7Z"/></svg>
          </a>
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
          <h1 id="page-title">GuitarEasy: Practising Guitar Made Easy</h1>
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
              <button class="sidebar-toggle" id="sidebar-toggle" type="button" aria-controls="control-panel" aria-expanded="true" title="Collapse file controls">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>
                <span>Controls</span>
              </button>
            </div>
            <div class="score-toolbar-actions">
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
              <div class="player-title-row"><strong id="song-title">Canon in D</strong><span id="song-artist">· alphaTex score</span></div>
              <div class="progress-track"><span id="progress-fill"></span></div>
            </div>
            <span class="player-time" id="song-position">00:00 / 00:00</span>
          </div>
        </section>
      </section>

      <footer class="footer-note"><span>© GuitarEasy.app</span></footer>
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
let loadedName = defaultScore.name
let activeScoreId = defaultScore.id
let isPlayerReady = false
let audioResumePending = false
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
    localStorage.setItem(scoreLibraryStorageKey, JSON.stringify(scoreLibrary.filter((score) => !bundledScoreIds.has(score.id))))
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
    meta.textContent = bundledScoreIds.has(score.id) ? 'built-in score' : 'uploaded score'
    copy.append(title, meta)

    const marker = document.createElement('span')
    marker.className = 'score-item-marker'
    marker.setAttribute('aria-hidden', 'true')
    marker.textContent = score.id === activeScoreId ? '✓' : ''

    selectButton.append(badge, copy, marker)
    selectButton.addEventListener('click', () => loadScore(score.id))
    row.append(selectButton)

    if (!bundledScoreIds.has(score.id)) {
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
  scoreLibrary.splice(bundledScores.length, 0, score)
  persistScoreLibrary()
  renderScoreLibrary()
  return score
}

function removeScore(scoreId: string) {
  const index = scoreLibrary.findIndex((score) => score.id === scoreId)
  if (index < 0 || bundledScoreIds.has(scoreLibrary[index].id)) return
  scoreLibrary.splice(index, 1)
  persistScoreLibrary()
  if (activeScoreId === scoreId) loadScore(defaultScore.id)
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

function recoverAudioAfterBackgrounding() {
  if (!isPlayerReady || !audioResumePending) return

  // alphaTab keeps the synth state as Playing while a mobile browser suspends
  // or interrupts its Web Audio context. Rebuilding the output source makes
  // the existing playback state audible again after the page becomes visible.
  if (api.playerState === alphaTab.synth.PlayerState.Playing) {
    api.pause()
    api.play()
  } else {
    audioResumePending = false
  }
}

function rememberAudioBeforeBackgrounding() {
  if (isPlayerReady && api.playerState === alphaTab.synth.PlayerState.Playing) {
    audioResumePending = true
  }
}

function handleAudioLifecycleChange() {
  if (document.visibilityState === 'hidden') {
    rememberAudioBeforeBackgrounding()
  } else {
    recoverAudioAfterBackgrounding()
  }
}

function handleAudioResumeGesture(event: Event) {
  if (!audioResumePending || document.visibilityState === 'hidden') return

  // Let the play button handler perform the recovery so this gesture does not
  // recover the player and then immediately toggle it back to paused.
  if (event.target instanceof Node && playPause.contains(event.target)) return

  recoverAudioAfterBackgrounding()
  audioResumePending = false
}

function loadTex(tex: string, name = loadedName, scoreId = activeScoreId) {
  hideError()
  setRenderState('rendering score', 'loading')
  isPlayerReady = false
  audioResumePending = false
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
api.playerFinished.on(() => {
  audioResumePending = false
})
api.playerPositionChanged.on((event) => {
  songPosition.textContent = `${formatDuration(event.currentTime)} / ${formatDuration(event.endTime)}`
  const percentage = event.endTime > 0 ? (event.currentTime / event.endTime) * 100 : 0
  progressFill.style.width = `${Math.min(100, Math.max(0, percentage))}%`
})

playPause.addEventListener('click', () => {
  if (!isPlayerReady) return

  if (audioResumePending && api.playerState === alphaTab.synth.PlayerState.Playing) {
    recoverAudioAfterBackgrounding()
    audioResumePending = false
    return
  }

  api.playPause()
})
stop.addEventListener('click', () => {
  if (isPlayerReady) {
    audioResumePending = false
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
  if (event.code === 'Space') {
    event.preventDefault()
    if (!isPlayerReady) return
    if (audioResumePending && api.playerState === alphaTab.synth.PlayerState.Playing) {
      recoverAudioAfterBackgrounding()
      audioResumePending = false
    } else {
      api.playPause()
    }
  }
})
document.addEventListener('visibilitychange', handleAudioLifecycleChange)
window.addEventListener('pagehide', rememberAudioBeforeBackgrounding)
window.addEventListener('pageshow', recoverAudioAfterBackgrounding)
document.addEventListener('pointerdown', handleAudioResumeGesture, true)

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
      name: 'load_default_score',
      title: 'Load default score',
      description: 'Load the visible bundled default alphaTex score into the notation preview.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute() {
        loadScore(defaultScore.id)
        return { title: defaultScore.name, filename: defaultScore.name, status: 'loaded' }
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

loadScore(defaultScore.id)
