import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
  type McpUiTheme,
} from '@modelcontextprotocol/ext-apps'
import type { CallToolResult } from '@modelcontextprotocol/client'
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

  function postToPlayer(message: ParentToPlayerMessage) {
    frame.contentWindow?.postMessage(message, PLAYER_ASSET_ORIGIN)
  }

  function flushPendingMessages() {
    if (!isBridgeReady) return
    if (pendingContext) postToPlayer({ type: HOST_CONTEXT_MESSAGE, context: pendingContext })
    if (pendingScore) postToPlayer({ type: LOAD_SCORE_MESSAGE, score: pendingScore })
  }

  window.addEventListener('message', async (event) => {
    if (event.origin !== PLAYER_ASSET_ORIGIN || event.source !== frame.contentWindow) return
    if (isPlayerReadyMessage(event.data)) {
      isBridgeReady = true
      bridgeStatus.hidden = true
      flushPendingMessages()
      return
    }
    if (!isOpenAudioPlayerMessage(event.data) || !isTrustedPlaybackUrl(event.data.url)) return

    try {
      const result = await hostApp.openLink({ url: event.data.url })
      if (result.isError) throw new Error('ChatGPT did not open the audio player.')
    } catch (error) {
      bridgeStatus.hidden = false
      bridgeStatus.textContent = errorMessage(error)
    }
  })

  frame.addEventListener('error', () => {
    bridgeStatus.hidden = false
    bridgeStatus.textContent = 'The audio player could not be loaded.'
  })

  const hostApp = connectToMcpHost(
    (score) => {
      pendingScore = score
      if (isBridgeReady) postToPlayer({ type: LOAD_SCORE_MESSAGE, score })
      else bridgeStatus.textContent = 'Loading score player…'
    },
    (context) => {
      pendingContext = context
      if (isBridgeReady) postToPlayer({ type: HOST_CONTEXT_MESSAGE, context })
    },
    (message) => {
      bridgeStatus.hidden = false
      bridgeStatus.textContent = message
    },
  )
}

async function startNativePlayer(isBridgePlayer: boolean, sessionId?: string) {
  const alphaTab = await import('@coderline/alphatab')

  if (isBridgePlayer) document.documentElement.classList.add('is-bridge-player')

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
  // audio inline like the main site — no host sandbox restrictions apply to
  // it the way they can to the outer widget frame. `audioBridgeFailed` is
  // only set true if that inline playback genuinely can't start (a host
  // whose nesting still blocks Web Audio), and only then do we fall back to
  // asking the host to open the score as a first-party page.
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
      outputMode: isBridgePlayer
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
  if (isBridgePlayer) scheduleReadinessTimeout()

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
    if (isBridgePlayer && !isSynthReady) {
      enterAudioFallbackMode('Audio isn’t available here — open the audio player to listen.')
    }
  })
  api.soundFontLoad.on((event) => {
    const percentage = event.total > 0 ? Math.floor((event.loaded / event.total) * 100) : 0
    setStatus(`Loading sound font… ${percentage}%`)
    if (isBridgePlayer && !isSynthReady && !audioBridgeFailed) scheduleReadinessTimeout()
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

  function openFallbackPlayer() {
    const url = currentScore?.playbackUrl
    if (!url || !isTrustedPlaybackUrl(url)) return
    setStatus('Opening audio player…')
    window.parent.postMessage({ type: OPEN_AUDIO_PLAYER_MESSAGE, url } satisfies OpenAudioPlayerMessage, '*')
  }

  playPauseButton.addEventListener('click', () => {
    if (audioBridgeFailed) {
      openFallbackPlayer()
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
      openFallbackPlayer()
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
    if (!response.ok) throw new Error('This audio player link has expired. Ask ChatGPT to open the score again.')
    const data = (await response.json()) as { name?: unknown; tex?: unknown }
    if (typeof data.name !== 'string' || typeof data.tex !== 'string') {
      throw new Error('The audio player received invalid score data.')
    }
    loadScore({ name: data.name, tex: data.tex })
  }

  if (isBridgePlayer) {
    window.addEventListener('message', (event) => {
      if (event.source !== window.parent || !isParentToPlayerMessage(event.data)) return
      if (event.data.type === LOAD_SCORE_MESSAGE) loadScore(event.data.score)
      else handleHostContextChanged(event.data.context)
    })
    window.parent.postMessage({ type: PLAYER_READY_MESSAGE } satisfies PlayerReadyMessage, '*')
    return
  }

  if (sessionId) {
    await loadPlaybackSession(sessionId)
    return
  }

  connectToMcpHost(loadScore, () => undefined, setStatus)
}

const searchParams = new URLSearchParams(window.location.search)
const isBridgePlayer = searchParams.get('bridge') === '1'
const sessionId = searchParams.get('session') ?? undefined
const isEmbeddedMcpView = window !== window.parent

if (isBridgePlayer || !isEmbeddedMcpView) {
  startNativePlayer(isBridgePlayer, sessionId).catch((error: unknown) => {
    root.innerHTML = `<div class="empty-state">${errorMessage(error)}</div>`
  })
} else {
  startSandboxBridge()
}
