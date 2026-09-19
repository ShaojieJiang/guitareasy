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
type ScoreSummary = {
  id: string
  name: string
  title: string
  artist: string
  builtIn: boolean
  owner: { id: string; displayName: string } | null
  isOwner: boolean
  isPublished: boolean
  rating: { average: number | null; count: number; mine: number | null }
  commentCount: number
}
type Comment = {
  id: string
  body: string
  author: { id: string; displayName: string }
  canDelete: boolean
  createdAt: string
}
type Viewer = { id: string; displayName: string; email: string }
type ScorePayload = { name: string; tex: string; playbackUrl?: string; theme?: ThemePreference }
// Everything play_atex returns: the notation for the player plus the
// account and community state rendered around it.
type OpenedScore = ScorePayload & {
  id: string | null
  score: ScoreSummary | null
  comments: Comment[]
  viewer: Viewer | null
}
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

function extractScore(result: CallToolResult): OpenedScore | undefined {
  const data = result.structuredContent as
    | {
        id?: string | null
        name?: string
        tex?: string
        playbackUrl?: string
        theme?: unknown
        score?: ScoreSummary | null
        comments?: Comment[]
        viewer?: Viewer
      }
    | undefined
  if (!data?.tex) return undefined
  const theme = data.theme === 'light' || data.theme === 'dark' || data.theme === 'system'
    ? data.theme
    : 'system'
  return {
    id: data.id ?? null,
    name: data.name ?? 'Untitled.atex',
    tex: data.tex,
    playbackUrl: data.playbackUrl,
    theme,
    score: data.score ?? null,
    comments: Array.isArray(data.comments) ? data.comments : [],
    viewer: data.viewer ?? null,
  }
}

function toolResultText(result: CallToolResult) {
  return result.content
    ?.map((item) => (item.type === 'text' ? item.text : ''))
    .filter(Boolean)
    .join('\n')
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
  onScore: (score: OpenedScore) => void,
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

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function startSandboxBridge() {
  root.innerHTML = `
    <div class="widget">
      <div class="widget-toolbar">
        <form class="widget-search" id="search-form" role="search">
          <input id="search-input" type="search" enterkeyhint="search" maxlength="200" placeholder="Search songs, artists, or uploaders" aria-label="Search scores" />
          <button type="submit" class="widget-button">Search</button>
        </form>
        <span class="widget-account" id="widget-account"></span>
      </div>
      <div class="search-results" id="search-results" hidden></div>
      <div class="player-bridge">
        <iframe
          id="player-frame"
          class="player-frame"
          title="GuitarEasy score player"
          src="${BRIDGE_PLAYER_URL}"
        ></iframe>
        <div class="bridge-status" id="bridge-status">Starting score player…</div>
      </div>
      <section class="widget-community" id="widget-community" aria-label="Ratings and comments"></section>
    </div>
  `

  const frame = document.getElementById('player-frame') as HTMLIFrameElement
  const bridgeStatus = document.getElementById('bridge-status')!
  const searchForm = document.getElementById('search-form') as HTMLFormElement
  const searchInput = document.getElementById('search-input') as HTMLInputElement
  const searchResults = document.getElementById('search-results')!
  const accountLabel = document.getElementById('widget-account')!
  const community = document.getElementById('widget-community')!
  let isBridgeReady = false
  let pendingScore: ScorePayload | undefined
  let pendingContext: McpUiHostContext | undefined
  let opened: OpenedScore | undefined
  let viewer: Viewer | null = null
  let communityError = ''

  function postToPlayer(message: ParentToPlayerMessage) {
    frame.contentWindow?.postMessage(message, PLAYER_ASSET_ORIGIN)
  }

  function flushPendingMessages() {
    if (!isBridgeReady) return
    if (pendingContext) postToPlayer({ type: HOST_CONTEXT_MESSAGE, context: pendingContext })
    if (pendingScore) postToPlayer({ type: LOAD_SCORE_MESSAGE, score: pendingScore })
  }

  // Calls a GuitarEasy tool through the host, which attaches the user's
  // OAuth token; tool errors surface as thrown messages.
  async function callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const result = await hostApp.callServerTool({ name, arguments: args })
    if (result.isError) throw new Error(toolResultText(result) || 'That did not work. Try again.')
    return result.structuredContent as T
  }

  function renderAccount() {
    accountLabel.textContent = viewer ? `Signed in as ${viewer.displayName}` : ''
  }

  function starText(average: number | null) {
    const rounded = Math.round(average ?? 0)
    return '★★★★★'.slice(0, rounded) + '☆☆☆☆☆'.slice(0, 5 - rounded)
  }

  function renderCommunity() {
    if (!opened) {
      community.hidden = true
      return
    }
    community.hidden = false
    const score = opened.score
    const parts: string[] = []
    const heading = score?.owner && !score.isOwner ? `${escapeHtml(opened.name)} · by ${escapeHtml(score.owner.displayName)}` : escapeHtml(opened.name)
    parts.push(`<div class="community-title"><strong>${heading}</strong></div>`)

    if (!score) {
      parts.push('<p class="community-hint">This score is not in your library yet.</p>')
      parts.push('<button type="button" class="widget-button is-primary" data-action="save">Save to my library</button>')
    } else if (score.builtIn) {
      parts.push('<p class="community-hint">Built-in example scores are not rated or discussed.</p>')
    } else {
      if (score.isOwner) {
        parts.push(`<div class="publish-row"><p class="community-hint">${
          score.isPublished
            ? 'Published — anyone on GuitarEasy can find, rate, and comment on this score.'
            : 'Only you can see this score. Publish it to let other players find, rate, and comment on it.'
        }</p><button type="button" class="widget-button ${score.isPublished ? '' : 'is-primary'}" data-action="toggle-publish">${
          score.isPublished ? 'Make private' : 'Publish'
        }</button></div>`)
      }
      if (score.isPublished) {
        const summary = score.rating.count
          ? `${score.rating.average?.toFixed(1)} out of 5 · ${score.rating.count} rating${score.rating.count === 1 ? '' : 's'}`
          : 'No ratings yet'
        parts.push(`<p class="rating-summary"><span class="stars" aria-hidden="true">${starText(score.rating.average)}</span> ${summary}</p>`)
        if (!score.isOwner) {
          const buttons = [1, 2, 3, 4, 5]
            .map((value) => `<button type="button" class="star-button ${(score.rating.mine ?? 0) >= value ? 'is-filled' : ''}" data-action="rate" data-stars="${value}" aria-label="Rate ${value} out of 5" aria-pressed="${score.rating.mine === value}">★</button>`)
            .join('')
          parts.push(`<div class="star-picker" role="group" aria-label="Your rating"><span>Your rating</span>${buttons}</div>`)
        }
        const comments = opened.comments
          .map((comment) => `<li class="comment"><div class="comment-meta"><strong>${escapeHtml(comment.author.displayName)}</strong><time datetime="${escapeHtml(comment.createdAt)}">${escapeHtml(new Date(comment.createdAt).toLocaleDateString())}</time>${
            comment.canDelete ? `<button type="button" class="comment-delete" data-action="delete-comment" data-comment-id="${escapeHtml(comment.id)}" aria-label="Delete comment">×</button>` : ''
          }</div><p>${escapeHtml(comment.body)}</p></li>`)
          .join('')
        parts.push(`<h3>Comments (${opened.comments.length})</h3><ol class="comment-list">${comments || '<li class="comment-empty">No comments yet.</li>'}</ol>`)
        parts.push('<form class="comment-form" data-action="comment"><textarea rows="2" maxlength="2000" required placeholder="Share a tip or say thanks…" aria-label="Add a comment"></textarea><button type="submit" class="widget-button is-primary">Post</button></form>')
      }
    }
    if (communityError) parts.push(`<p class="widget-error" role="alert">${escapeHtml(communityError)}</p>`)
    community.innerHTML = parts.join('')
  }

  function showOpenedScore(score: OpenedScore) {
    opened = score
    if (score.viewer) viewer = score.viewer
    communityError = ''
    applyThemePreference(score.theme ?? 'system')
    pendingScore = { name: score.name, tex: score.tex, playbackUrl: score.playbackUrl, theme: score.theme }
    if (isBridgeReady) postToPlayer({ type: LOAD_SCORE_MESSAGE, score: pendingScore })
    else bridgeStatus.textContent = 'Loading score player…'
    renderAccount()
    renderCommunity()
  }

  async function refreshDetails() {
    if (!opened?.score) return
    const details = await callTool<{ score: ScoreSummary; comments: Comment[]; viewer: Viewer }>('get_score_details', { id: opened.score.id })
    opened = { ...opened, score: details.score, comments: details.comments }
    viewer = details.viewer
  }

  async function runAction(action: () => Promise<void>) {
    communityError = ''
    community.classList.add('is-busy')
    try {
      await action()
    } catch (error) {
      communityError = errorMessage(error)
    } finally {
      community.classList.remove('is-busy')
      renderAccount()
      renderCommunity()
    }
  }

  community.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]')
    if (!button || !opened) return
    const current = opened
    switch (button.dataset.action) {
      case 'save':
        void runAction(async () => {
          const saved = await callTool<{ score: ScoreSummary }>('upload_atex', { name: current.name, tex: current.tex })
          opened = { ...current, id: saved.score.id, score: saved.score, comments: [] }
        })
        break
      case 'toggle-publish':
        void runAction(async () => {
          const result = await callTool<{ score: ScoreSummary }>('publish_score', { id: current.score!.id, published: !current.score!.isPublished })
          opened = { ...current, score: result.score }
          if (result.score.isPublished) await refreshDetails()
        })
        break
      case 'rate':
        void runAction(async () => {
          const result = await callTool<{ score: ScoreSummary }>('rate_score', { id: current.score!.id, stars: Number(button.dataset.stars) })
          opened = { ...current, score: result.score }
        })
        break
      case 'delete-comment':
        void runAction(async () => {
          await callTool('delete_comment', { commentId: button.dataset.commentId })
          await refreshDetails()
        })
        break
    }
  })

  community.addEventListener('submit', (event) => {
    const form = (event.target as HTMLElement).closest<HTMLFormElement>('form[data-action="comment"]')
    if (!form || !opened?.score) return
    event.preventDefault()
    const body = form.querySelector('textarea')!.value.trim()
    if (!body) return
    const scoreId = opened.score.id
    void runAction(async () => {
      await callTool('add_comment', { id: scoreId, body })
      await refreshDetails()
    })
  })

  // Search runs only on submit (Enter or the Search button), never as the
  // user types.
  searchForm.addEventListener('submit', (event) => {
    event.preventDefault()
    const query = searchInput.value.trim()
    if (!query) {
      searchResults.hidden = true
      return
    }
    searchResults.hidden = false
    searchResults.innerHTML = '<p class="search-status">Searching…</p>'
    callTool<{ scores: ScoreSummary[] }>('search_scores', { query })
      .then(({ scores }) => {
        const rows = scores
          .map((score) => {
            const meta = [
              score.artist,
              score.builtIn ? 'built-in' : score.isOwner ? (score.isPublished ? 'yours · published' : 'yours · private') : score.owner ? `by ${score.owner.displayName}` : '',
              score.rating.count ? `★ ${score.rating.average?.toFixed(1)}` : '',
            ].filter(Boolean).join(' · ')
            return `<li><button type="button" class="search-result" data-score-id="${escapeHtml(score.id)}"><strong>${escapeHtml(score.name)}</strong><small>${escapeHtml(meta)}</small></button></li>`
          })
          .join('')
        searchResults.innerHTML = `<div class="search-heading"><span>${scores.length} result${scores.length === 1 ? '' : 's'} for “${escapeHtml(query)}”</span><button type="button" class="link-button" data-action="close-search">Close</button></div>${
          rows ? `<ul>${rows}</ul>` : `<p class="search-status">No scores match “${escapeHtml(query)}”.</p>`
        }`
      })
      .catch((error: unknown) => {
        searchResults.innerHTML = `<p class="widget-error" role="alert">${escapeHtml(errorMessage(error))}</p>`
      })
  })

  searchResults.addEventListener('click', (event) => {
    const target = event.target as HTMLElement
    if (target.closest('[data-action="close-search"]')) {
      searchResults.hidden = true
      return
    }
    const result = target.closest<HTMLButtonElement>('[data-score-id]')
    if (!result) return
    result.disabled = true
    hostApp
      .callServerTool({ name: 'play_atex', arguments: { id: result.dataset.scoreId, theme: requestedTheme } })
      .then((toolResult) => {
        if (toolResult.isError) throw new Error(toolResultText(toolResult) || 'That score could not be opened.')
        const score = extractScore(toolResult)
        if (!score) throw new Error('That score could not be opened.')
        searchResults.hidden = true
        showOpenedScore(score)
      })
      .catch((error: unknown) => {
        result.disabled = false
        communityError = errorMessage(error)
        renderCommunity()
      })
  })

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

  renderCommunity()
  const hostApp = connectToMcpHost(
    showOpenedScore,
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
