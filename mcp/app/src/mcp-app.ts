import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
  type McpUiTheme,
} from '@modelcontextprotocol/ext-apps'
import type { CallToolResult } from '@modelcontextprotocol/client'
import alphaTabSynthWorkerUrl from './alphatab-synth-worker?worker&url'
import './mcp-app.css'

const PLAYER_ASSET_ORIGIN = 'https://guitareasy.app'
const BRIDGE_PLAYER_URL = `${PLAYER_ASSET_ORIGIN}/mcp-app/?bridge=1`
const PLAYER_READY_MESSAGE = 'guitareasy:player-ready'
const LOAD_SCORE_MESSAGE = 'guitareasy:load-score'
const HOST_CONTEXT_MESSAGE = 'guitareasy:host-context'
const OPEN_AUDIO_PLAYER_MESSAGE = 'guitareasy:open-audio-player'

type ScoreRenderPalette = {
  staffLineColor: string
  barSeparatorColor: string
  barNumberColor: string
  mainGlyphColor: string
  secondaryGlyphColor: string
  scoreInfoColor: string
}

const SCORE_RENDER_PALETTES: Record<McpUiTheme, ScoreRenderPalette> = {
  light: {
    staffLineColor: '#8b919c',
    barSeparatorColor: '#3e434d',
    barNumberColor: '#675db4',
    mainGlyphColor: '#20242d',
    secondaryGlyphColor: 'rgba(32, 36, 45, 0.5)',
    scoreInfoColor: '#20242d',
  },
  dark: {
    staffLineColor: '#9299a6',
    barSeparatorColor: '#c1c7d0',
    barNumberColor: '#b4aaff',
    mainGlyphColor: '#f1f3f5',
    secondaryGlyphColor: 'rgba(241, 243, 245, 0.58)',
    scoreInfoColor: '#f1f3f5',
  },
}

type ThemePreference = McpUiTheme | 'system'
type ScorePayload = { name: string; tex: string; playbackUrl?: string; theme?: ThemePreference }
type PlayerReadyMessage = { type: typeof PLAYER_READY_MESSAGE }
type LoadScoreMessage = { type: typeof LOAD_SCORE_MESSAGE; score: ScorePayload }
type HostContextMessage = { type: typeof HOST_CONTEXT_MESSAGE; context: McpUiHostContext }
type ParentToPlayerMessage = LoadScoreMessage | HostContextMessage
type OpenAudioPlayerMessage = { type: typeof OPEN_AUDIO_PLAYER_MESSAGE; url: string }

const root = document.getElementById('app')!
let nativePlayerThemeChange: ((theme: McpUiTheme) => void) | undefined
let requestedTheme: ThemePreference = 'system'
let hostTheme: McpUiTheme | undefined

function getScoreRenderPalette(theme: McpUiTheme) {
  return SCORE_RENDER_PALETTES[theme]
}

function getSystemTheme(): McpUiTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getEffectiveTheme(preference: ThemePreference = requestedTheme): McpUiTheme {
  if (preference !== 'system') return preference
  return hostTheme ?? getSystemTheme()
}

function applyThemePreference(preference: ThemePreference) {
  requestedTheme = preference
  const effectiveTheme = getEffectiveTheme(preference)
  applyDocumentTheme(effectiveTheme)
  nativePlayerThemeChange?.(effectiveTheme)
}

function extractScore(result: CallToolResult): ScorePayload | undefined {
  const data = result.structuredContent as
    | { name?: string; tex?: string; playbackUrl?: string; theme?: unknown }
    | undefined
  if (!data?.tex) return undefined
  const theme = data.theme === 'light' || data.theme === 'dark' || data.theme === 'system'
    ? data.theme
    : 'system'
  return {
    name: data.name ?? 'Untitled.atex',
    tex: data.tex,
    playbackUrl: data.playbackUrl,
    theme,
  }
}

function handleHostContextChanged(ctx: McpUiHostContext) {
  if (ctx.theme) {
    hostTheme = ctx.theme
    if (requestedTheme === 'system') applyThemePreference('system')
  }
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables)
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts)
}

const systemThemeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
systemThemeMediaQuery.addEventListener('change', () => {
  if (requestedTheme === 'system' && !hostTheme) applyThemePreference('system')
})

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'An error occurred.'
}

function connectToMcpHost(
  onScore: (score: ScorePayload) => void,
  onContext: (context: McpUiHostContext) => void,
  onError: (message: string) => void,
  onConnected?: () => void,
) {
  const app = new App({ name: 'GuitarEasy player', version: '1.1.0' })

  app.ontoolresult = (result) => {
    const score = extractScore(result)
    if (score) {
      applyThemePreference(score.theme ?? 'system')
      onScore(score)
    }
    else onError('No score data received from the tool call.')
  }
  app.onhostcontextchanged = (context) => {
    handleHostContextChanged(context)
    onContext(context)
  }
  app.onerror = (error) => onError(errorMessage(error))

  app
    .connect()
    .then(() => {
      const context = app.getHostContext()
      if (context) {
        handleHostContextChanged(context)
        onContext(context)
      }
      onConnected?.()
    })
    .catch((error: unknown) => onError(errorMessage(error)))

  return app
}

function isPlayerReadyMessage(value: unknown): value is PlayerReadyMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === PLAYER_READY_MESSAGE
  )
}

function isParentToPlayerMessage(value: unknown): value is ParentToPlayerMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    (value.type === LOAD_SCORE_MESSAGE || value.type === HOST_CONTEXT_MESSAGE)
  )
}

function isOpenAudioPlayerMessage(value: unknown): value is OpenAudioPlayerMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === OPEN_AUDIO_PLAYER_MESSAGE &&
    'url' in value &&
    typeof value.url === 'string'
  )
}

function isTrustedPlaybackUrl(value: string) {
  try {
    const url = new URL(value)
    return (
      url.origin === PLAYER_ASSET_ORIGIN &&
      url.pathname === '/mcp-app/' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        url.searchParams.get('session') ?? '',
      )
    )
  } catch {
    return false
  }
}

// How long to wait for the nested first-party frame to report itself ready
// before giving up on it and rendering in the host's own widget frame.
const BRIDGE_READY_TIMEOUT_MS = 2500

// A host that blocks nested frames blocks them silently: the iframe fires no
// error, it simply never loads. Read the CSP the host says it applied, when
// it reports one, so those hosts skip the wait entirely.
function hostAllowsNestedPlayerFrame(app: App): boolean | undefined {
  const csp = app.getHostCapabilities()?.sandbox?.csp
  if (!csp) return undefined
  return (csp.frameDomains ?? []).some((domain) => domain.replace(/\/$/, '') === PLAYER_ASSET_ORIGIN)
}

function startSandboxBridge() {
  root.innerHTML = `
    <div class="player-bridge">
      <iframe
        id="player-frame"
        class="player-frame"
        title="GuitarEasy score player"
        src="${BRIDGE_PLAYER_URL}"
      ></iframe>
      <div class="bridge-status" id="bridge-status">Starting score player…</div>
    </div>
  `

  const frame = document.getElementById('player-frame') as HTMLIFrameElement
  const bridgeStatus = document.getElementById('bridge-status')!
  let isBridgeReady = false
  let pendingScore: ScorePayload | undefined
  let pendingContext: McpUiHostContext | undefined
  // Set once the bridge has been abandoned and alphaTab runs in this frame.
  let framePlayer: NativePlayer | undefined
  let isFallingBack = false
  let readyTimer: ReturnType<typeof setTimeout> | undefined

  function postToPlayer(message: ParentToPlayerMessage) {
    frame.contentWindow?.postMessage(message, PLAYER_ASSET_ORIGIN)
  }

  function flushPendingMessages() {
    if (!isBridgeReady) return
    if (pendingContext) postToPlayer({ type: HOST_CONTEXT_MESSAGE, context: pendingContext })
    if (pendingScore) postToPlayer({ type: LOAD_SCORE_MESSAGE, score: pendingScore })
  }

  // claude.ai enforces `frame-src 'self' blob: data:` and drops the
  // frameDomains the resource declares, so the nested player frame never
  // loads there and the widget would sit on its placeholder forever. Render
  // alphaTab directly in the host's widget frame instead; audio still
  // degrades to the open-a-page flow if this frame can't play either.
  async function renderInHostFrame(reason: string) {
    if (isFallingBack) return
    isFallingBack = true
    if (readyTimer !== undefined) clearTimeout(readyTimer)
    console.warn(`GuitarEasy: ${reason} Rendering the player in the host's frame instead.`)
    try {
      framePlayer = await startNativePlayer({ mode: 'embedded', hostApp })
      // Read `pendingScore` only now: loading alphaTab is async, and the
      // tool result may have landed while it was still importing.
      if (pendingScore) framePlayer.loadScore(pendingScore)
    } catch (error) {
      root.innerHTML = `<div class="empty-state">${errorMessage(error)}</div>`
    }
  }

  window.addEventListener('message', async (event) => {
    if (event.origin !== PLAYER_ASSET_ORIGIN || event.source !== frame.contentWindow) return
    if (isPlayerReadyMessage(event.data)) {
      if (isFallingBack) return
      isBridgeReady = true
      if (readyTimer !== undefined) clearTimeout(readyTimer)
      bridgeStatus.hidden = true
      flushPendingMessages()
      return
    }
    if (!isOpenAudioPlayerMessage(event.data) || !isTrustedPlaybackUrl(event.data.url)) return

    try {
      const result = await hostApp.openLink({ url: event.data.url })
      if (result.isError) throw new Error('The host did not open the audio player.')
    } catch (error) {
      bridgeStatus.hidden = false
      bridgeStatus.textContent = errorMessage(error)
    }
  })

  frame.addEventListener('error', () => {
    void renderInHostFrame('The nested player frame failed to load.')
  })

  const hostApp = connectToMcpHost(
    (score) => {
      // Always recorded: a fallback still importing alphaTab picks it up
      // from here once it is ready.
      pendingScore = score
      if (framePlayer) framePlayer.loadScore(score)
      else if (isFallingBack) return
      else if (isBridgeReady) postToPlayer({ type: LOAD_SCORE_MESSAGE, score })
      else bridgeStatus.textContent = 'Loading score player…'
    },
    (context) => {
      pendingContext = context
      // After the fallback the context is already applied to this document by
      // `handleHostContextChanged`; there is no nested frame to forward to.
      if (!isFallingBack && isBridgeReady) postToPlayer({ type: HOST_CONTEXT_MESSAGE, context })
    },
    (message) => {
      if (framePlayer) {
        framePlayer.setStatus(message)
        return
      }
      if (isFallingBack) return
      bridgeStatus.hidden = false
      bridgeStatus.textContent = message
    },
    () => {
      if (hostAllowsNestedPlayerFrame(hostApp) === false) {
        void renderInHostFrame('This host does not allow the player to load in a nested frame.')
      }
    },
  )

  // Whatever the host advertises, a frame that never reports ready is a
  // frame that isn't going to load.
  readyTimer = setTimeout(() => {
    if (!isBridgeReady) void renderInHostFrame('The nested player frame did not load in time.')
  }, BRIDGE_READY_TIMEOUT_MS)
}

// Where the alphaTab player is running:
// - `standalone`: the plain guitareasy.app/mcp-app/ page, opened directly.
// - `session`: the same page, opened by the host to play one score (audio
//   fallback of the two framed modes below).
// - `bridge`: the nested first-party frame inside a host's widget frame.
// - `embedded`: the host's own widget frame, on hosts that block nesting.
type PlayerMode = 'standalone' | 'session' | 'bridge' | 'embedded'

type NativePlayerOptions = {
  mode: PlayerMode
  sessionId?: string
  // Set in `embedded` mode: the live connection to the host, needed to ask
  // it to open the audio player when the widget frame itself can't play.
  hostApp?: App
}

// The handles a caller keeps on a running player: feeding it later scores
// and reporting host-level problems in its own status line.
type NativePlayer = {
  loadScore: (score: ScorePayload) => void
  setStatus: (text: string) => void
}

type AlphaTabModule = typeof import('@coderline/alphatab')

// alphaTab synthesizes audio in a Web Worker it builds from a URL on the
// origin its bundle came from. In `embedded` mode that origin is the host's
// sandbox, not guitareasy.app, so every construction path alphaTab tries is
// cross-origin and fails — and because it only fetches the soundfont once
// the player reports ready, audio then stalls before the first byte.
//
// Workers must be same-origin, but their *source* need not be: fetch the
// bundled worker over CORS and run it from a blob, which is same-origin to
// this document. The built entry is self-contained (no imports, no exports),
// so it loads as a classic worker and never needs a module graph.
async function installSameOriginSynthWorker(alphaTab: AlphaTabModule): Promise<boolean> {
  try {
    const response = await fetch(alphaTabSynthWorkerUrl, { mode: 'cors' })
    if (!response.ok) throw new Error(`Fetching the synth worker returned HTTP ${response.status}.`)
    const blobUrl = URL.createObjectURL(new Blob([await response.text()], { type: 'text/javascript' }))
    alphaTab.Environment.initializeMain(
      () => new Worker(blobUrl),
      // Only reached for the AudioWorklet output, which the framed modes
      // never select; the ScriptProcessor output needs no worklet module.
      () => Promise.reject(new Error('Audio worklets are not used in a host frame.')),
    )
    return true
  } catch (error) {
    console.warn('GuitarEasy: could not load the synth worker from a same-origin blob.', error)
    return false
  }
}

async function startNativePlayer(options: NativePlayerOptions): Promise<NativePlayer> {
  const { mode, sessionId, hostApp } = options
  // Both framed modes render inside a host-controlled sandbox, so they take
  // the conservative audio path and the audio-fallback flow.
  const isFramed = mode === 'bridge' || mode === 'embedded'
  const alphaTab = await import('@coderline/alphatab')

  // Only the host's own frame has the cross-origin problem: the bridge frame
  // and the standalone page are already served from guitareasy.app.
  if (mode === 'embedded') await installSameOriginSynthWorker(alphaTab)

  if (isFramed) document.documentElement.classList.add('is-framed-player')

  root.innerHTML = `
    <div class="player">
      <div class="player-header">
        <h1 id="song-title">GuitarEasy player</h1>
        <span id="song-artist"></span>
      </div>
      <div class="player-status" id="status">Waiting for a score…</div>
      <div class="notation-viewport" id="notation-viewport">
        <div class="notation-canvas" id="notation-canvas"></div>
      </div>
      <div class="player-bar" id="player-bar" hidden>
        <button id="play-pause" type="button" aria-label="Play or pause" disabled>▶</button>
        <button id="stop" class="is-secondary" type="button" aria-label="Stop" disabled>■</button>
        <div class="player-progress" id="player-progress"><div class="player-progress-fill" id="progress-fill"></div></div>
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
  const playerProgress = document.getElementById('player-progress')!
  const progressFill = document.getElementById('progress-fill') as HTMLElement
  const position = document.getElementById('position')!
  const initialTheme = getEffectiveTheme()
  let isSynthReady = false
  let hasScore = false
  let currentScore: ScorePayload | undefined
  // The nested bridge frame is a real guitareasy.app document, so it plays
  // audio inline like the main site. The `embedded` frame is the host's own
  // sandbox, which may or may not permit audio. `audioBridgeFailed` is only
  // set true if inline playback genuinely can't start, and only then do we
  // fall back to asking the host to open the score as a first-party page.
  let audioBridgeFailed = false
  let readinessTimer: ReturnType<typeof setTimeout> | undefined

  function formatDuration(milliseconds: number) {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  function setStatus(text: string) {
    status.textContent = text
  }

  function updateControls() {
    if (audioBridgeFailed) {
      playPauseButton.disabled = !hasScore || !currentScore?.playbackUrl
      stopButton.disabled = true
      return
    }
    playPauseButton.disabled = !isSynthReady || !hasScore
    stopButton.disabled = !isSynthReady || !hasScore
  }

  function enterAudioFallbackMode(message: string) {
    if (audioBridgeFailed) return
    audioBridgeFailed = true
    if (readinessTimer !== undefined) {
      clearTimeout(readinessTimer)
      readinessTimer = undefined
    }
    playPauseButton.textContent = '↗'
    playPauseButton.setAttribute('aria-label', 'Open audio player')
    playPauseButton.title = 'Open audio player'
    stopButton.hidden = true
    playerProgress.hidden = true
    position.hidden = true
    updateControls()
    setStatus(message)
  }

  const api = new alphaTab.AlphaTabApi(notationCanvas, {
    core: {
      tex: true,
      useWorkers: false,
      fontDirectory: `${PLAYER_ASSET_ORIGIN}/mcp-app/font/`,
    },
    display: {
      layoutMode: alphaTab.LayoutMode.Page,
      scale: 0.9,
      staveProfile: alphaTab.StaveProfile.Tab,
      resources: getScoreRenderPalette(initialTheme),
    },
    player: {
      enablePlayer: true,
      enableCursor: true,
      enableAnimatedBeatCursor: true,
      enableElementHighlighting: true,
      // AudioWorklets load their processor module over a separate blob-URL
      // step that a nested frame's inherited host CSP can block even when
      // ordinary script/fetch works fine. The legacy ScriptProcessor path
      // has no such module-loading step, so the bridge frame uses it to
      // avoid depending on that being permitted.
      outputMode: isFramed
        ? alphaTab.PlayerOutputMode.WebAudioScriptProcessor
        : alphaTab.PlayerOutputMode.WebAudioAudioWorklets,
      soundFont: `${PLAYER_ASSET_ORIGIN}/mcp-app/soundfont/sonivox.sf2`,
      scrollElement: notationViewport,
      scrollMode: alphaTab.ScrollMode.OffScreen,
      scrollOffsetY: -24,
    },
  })

  function applyScoreTheme(theme: McpUiTheme) {
    const palette = getScoreRenderPalette(theme)
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

  nativePlayerThemeChange = applyScoreTheme

  // Give inline audio a chance to come up; if the synth never becomes ready
  // in a host that blocks it, degrade to the open-a-page flow instead of
  // leaving the play button silently non-functional. Reset on soundfont
  // load progress below so a slow connection doesn't trip it prematurely —
  // only a real stall counts.
  function scheduleReadinessTimeout() {
    if (readinessTimer !== undefined) clearTimeout(readinessTimer)
    readinessTimer = setTimeout(() => {
      if (!isSynthReady) {
        enterAudioFallbackMode('Audio isn’t available here — open the audio player to listen.')
      }
    }, 8000)
  }
  if (isFramed) scheduleReadinessTimeout()

  api.renderStarted.on(() => setStatus('Rendering score…'))
  api.renderFinished.on(() => {
    if (!hasScore) setStatus('Waiting for a score…')
    else if (audioBridgeFailed) setStatus('Score ready — open the audio player to listen.')
    else setStatus(isSynthReady ? 'Ready to play.' : 'Loading sound font…')
  })
  api.scoreLoaded.on((score) => {
    hasScore = true
    songTitle.textContent = score.title || songTitle.textContent
    songArtist.textContent = score.artist ? `· ${score.artist}` : ''
    playerBar.hidden = false
    updateControls()
    if (audioBridgeFailed) setStatus('Score ready — open the audio player to listen.')
  })
  api.error.on((error) => {
    setStatus(error.message || 'alphaTab could not render this score.')
    if (isFramed && !isSynthReady) {
      enterAudioFallbackMode('Audio isn’t available here — open the audio player to listen.')
    }
  })
  api.soundFontLoad.on((event) => {
    const percentage = event.total > 0 ? Math.floor((event.loaded / event.total) * 100) : 0
    setStatus(`Loading sound font… ${percentage}%`)
    if (isFramed && !isSynthReady && !audioBridgeFailed) scheduleReadinessTimeout()
  })
  api.playerReady.on(() => {
    isSynthReady = true
    if (readinessTimer !== undefined) {
      clearTimeout(readinessTimer)
      readinessTimer = undefined
    }
    updateControls()
    setStatus(hasScore ? 'Ready to play.' : 'Waiting for a score…')
  })
  api.playerStateChanged.on((event) => {
    const isPlaying = event.state === alphaTab.synth.PlayerState.Playing
    playPauseButton.textContent = isPlaying ? '⏸' : '▶'
    setStatus(isPlaying ? 'Playing…' : 'Ready to play.')
  })
  api.playerPositionChanged.on((event) => {
    position.textContent = `${formatDuration(event.currentTime)} / ${formatDuration(event.endTime)}`
    const percentage = event.endTime > 0 ? (event.currentTime / event.endTime) * 100 : 0
    progressFill.style.width = `${Math.min(100, Math.max(0, percentage))}%`
  })

  async function openFallbackPlayer() {
    const url = currentScore?.playbackUrl
    if (!url || !isTrustedPlaybackUrl(url)) return
    setStatus('Opening audio player…')
    // In `bridge` mode the outer widget frame holds the host connection, so
    // ask it to do this. In `embedded` mode this frame holds it itself.
    if (!hostApp) {
      window.parent.postMessage({ type: OPEN_AUDIO_PLAYER_MESSAGE, url } satisfies OpenAudioPlayerMessage, '*')
      return
    }
    try {
      const result = await hostApp.openLink({ url })
      if (result.isError) throw new Error('The host did not open the audio player.')
    } catch (error) {
      setStatus(errorMessage(error))
    }
  }

  playPauseButton.addEventListener('click', () => {
    if (audioBridgeFailed) {
      void openFallbackPlayer()
      return
    }
    if (isSynthReady && hasScore) api.playPause()
  })
  stopButton.addEventListener('click', () => {
    if (!isSynthReady || !hasScore) return
    api.stop()
    progressFill.style.width = '0%'
    position.textContent = '00:00 / 00:00'
  })
  document.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' || !hasScore) return
    event.preventDefault()
    if (audioBridgeFailed) {
      void openFallbackPlayer()
      return
    }
    if (!isSynthReady) return
    api.playPause()
  })

  function loadScore(score: ScorePayload) {
    currentScore = score
    applyThemePreference(score.theme ?? 'system')
    songTitle.textContent = score.name
    setStatus('Rendering score…')
    api.tex(score.tex)
  }

  async function loadPlaybackSession(id: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      throw new Error('Invalid audio player link.')
    }
    const response = await fetch(
      `${PLAYER_ASSET_ORIGIN}/mcp-app/session/${encodeURIComponent(id)}`,
      { cache: 'no-store' },
    )
    if (!response.ok) throw new Error('This audio player link has expired. Ask the assistant to open the score again.')
    const data = (await response.json()) as { name?: unknown; tex?: unknown }
    if (typeof data.name !== 'string' || typeof data.tex !== 'string') {
      throw new Error('The audio player received invalid score data.')
    }
    loadScore({ name: data.name, tex: data.tex })
  }

  if (mode === 'bridge') {
    window.addEventListener('message', (event) => {
      if (event.source !== window.parent || !isParentToPlayerMessage(event.data)) return
      if (event.data.type === LOAD_SCORE_MESSAGE) loadScore(event.data.score)
      else handleHostContextChanged(event.data.context)
    })
    window.parent.postMessage({ type: PLAYER_READY_MESSAGE } satisfies PlayerReadyMessage, '*')
    return { loadScore, setStatus }
  }

  // Running in the host's own widget frame, on an already-connected host.
  // The caller feeds it the pending score and re-routes later tool results.
  if (mode === 'embedded') return { loadScore, setStatus }

  if (mode === 'session' && sessionId) {
    await loadPlaybackSession(sessionId)
    return { loadScore, setStatus }
  }

  connectToMcpHost(loadScore, () => undefined, setStatus)
  return { loadScore, setStatus }
}

const searchParams = new URLSearchParams(window.location.search)
const isBridgePlayer = searchParams.get('bridge') === '1'
const sessionId = searchParams.get('session') ?? undefined
const isEmbeddedMcpView = window !== window.parent

if (isBridgePlayer || !isEmbeddedMcpView) {
  const mode: PlayerMode = isBridgePlayer ? 'bridge' : sessionId ? 'session' : 'standalone'
  startNativePlayer({ mode, sessionId }).catch((error: unknown) => {
    root.innerHTML = `<div class="empty-state">${errorMessage(error)}</div>`
  })
} else {
  startSandboxBridge()
}
