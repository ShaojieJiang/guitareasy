// Sign-in for the GuitarEasy website: Google and Apple OAuth plus emailed
// one-time codes, all ending in the same HttpOnly session cookie. Ported from
// GatherEasy's FastAPI implementation (service_oauth.py, adapters.py,
// auth_cookies.py) onto Workers primitives.
import { sendSignInCode } from './email'
import { isProduction, publicOrigin, type Env } from './env'
import {
  base64UrlDecode,
  base64UrlEncode,
  clientIp,
  HttpError,
  newId,
  parseCookies,
  randomCode,
  randomToken,
  safeReturnPath,
  serializeCookie,
  sha256,
  signPayload,
  timingSafeEqual,
  verifyPayload,
} from './util'

export type User = { id: string; email: string; displayName: string }
export type OAuthProviderName = 'google' | 'apple'

const SESSION_COOKIE = 'ge_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const OAUTH_NONCE_COOKIE = 'ge_oauth_nonce'
const OAUTH_NONCE_COOKIE_PATH = '/api/auth/oauth'
const OAUTH_STATE_TTL_MS = 15 * 60 * 1000
const CHALLENGE_TTL_MS = 10 * 60 * 1000
const MAX_CHALLENGE_ATTEMPTS = 5
// Each network gets its own budget per address, so someone requesting codes
// for another person's email cannot lock that person out from their own
// connection. The higher overall cap still limits how many emails one
// address can be sent.
const MAX_CHALLENGES_PER_EMAIL_AND_IP = 5
const MAX_CHALLENGES_PER_EMAIL = 20
const MAX_CHALLENGES_PER_IP = 20
const CHALLENGE_WINDOW_MS = 60 * 60 * 1000
const DEV_AUTH_SECRET = 'guitareasy-local-development-secret'

type UserRow = { id: string; email: string; display_name: string | null }

function toUser(row: UserRow): User {
  return { id: row.id, email: row.email, displayName: row.display_name || defaultDisplayName(row.email) }
}

// Public pages show this name next to published scores and comments, so it
// never falls back to the full email address.
function defaultDisplayName(email: string) {
  return email.split('@')[0]!.slice(0, 40) || 'Guitarist'
}

function authSecret(env: Env) {
  if (env.AUTH_SECRET) return env.AUTH_SECRET
  if (isProduction(env)) throw new Error('AUTH_SECRET is not configured.')
  return DEV_AUTH_SECRET
}

function usesSecureCookies(env: Env, request: Request) {
  return publicOrigin(env, request).startsWith('https://')
}

export function normalizeEmail(value: unknown) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'invalid_email', 'Enter a valid email address.')
  }
  return email
}

export async function getUser(env: Env, userId: string): Promise<User | undefined> {
  const row = await env.DB.prepare('SELECT id, email, display_name FROM users WHERE id = ?')
    .bind(userId)
    .first<UserRow>()
  return row ? toUser(row) : undefined
}

async function getOrCreateUser(env: Env, email: string, displayName?: string | null): Promise<User> {
  const now = Date.now()
  // INSERT OR IGNORE keeps two simultaneous first sign-ins for one address
  // from racing into a unique-constraint failure.
  await env.DB.prepare('INSERT OR IGNORE INTO users (id, email, display_name, created_at) VALUES (?, ?, ?, ?)')
    .bind(newId(), email, displayName?.trim().slice(0, 60) || null, now)
    .run()
  const row = await env.DB.prepare('SELECT id, email, display_name FROM users WHERE email = ?')
    .bind(email)
    .first<UserRow>()
  if (!row) throw new Error('User could not be created.')
  return toUser(row)
}

export async function updateDisplayName(env: Env, userId: string, value: unknown) {
  const displayName = typeof value === 'string' ? value.trim() : ''
  if (!displayName || displayName.length > 60) {
    throw new HttpError(400, 'invalid_display_name', 'Display names must be 1 to 60 characters.')
  }
  await env.DB.prepare('UPDATE users SET display_name = ? WHERE id = ?').bind(displayName, userId).run()
  return getUser(env, userId)
}

// ---------------------------------------------------------------------------
// Sessions

export async function createSessionCookie(env: Env, request: Request, userId: string) {
  const token = randomToken()
  const now = Date.now()
  await env.DB.prepare(
    'INSERT INTO sessions (id, user_id, user_agent, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(await sha256(token), userId, request.headers.get('User-Agent')?.slice(0, 300) ?? null, now, now + SESSION_TTL_MS)
    .run()
  return serializeCookie(SESSION_COOKIE, token, {
    maxAge: SESSION_TTL_MS / 1000,
    secure: usesSecureCookies(env, request),
  })
}

export function clearSessionCookie(env: Env, request: Request) {
  return serializeCookie(SESSION_COOKIE, '', { maxAge: 0, secure: usesSecureCookies(env, request) })
}

export async function getSessionUser(env: Env, request: Request): Promise<User | undefined> {
  const token = parseCookies(request).get(SESSION_COOKIE)
  if (!token) return undefined
  const row = await env.DB.prepare(
    `SELECT users.id, users.email, users.display_name FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.id = ? AND sessions.expires_at > ?`,
  )
    .bind(await sha256(token), Date.now())
    .first<UserRow>()
  return row ? toUser(row) : undefined
}

export async function destroySession(env: Env, request: Request) {
  const token = parseCookies(request).get(SESSION_COOKIE)
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256(token)).run()
}

// Run daily by the cron trigger. Challenges are kept for the whole rate-limit
// window, since the limits count them, even after they expire.
export async function deleteExpiredAuthRows(env: Env) {
  const now = Date.now()
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
    env.DB.prepare('DELETE FROM auth_challenges WHERE created_at <= ?').bind(now - CHALLENGE_WINDOW_MS),
  ])
}

// ---------------------------------------------------------------------------
// Email one-time codes

export async function startEmailChallenge(env: Env, request: Request, emailInput: unknown) {
  const email = normalizeEmail(emailInput)
  const ip = clientIp(request)
  const now = Date.now()
  const since = now - CHALLENGE_WINDOW_MS
  const [byEmailAndIp, byEmail, byIp] = await env.DB.batch<{ count: number }>([
    env.DB.prepare('SELECT COUNT(*) AS count FROM auth_challenges WHERE email = ? AND ip = ? AND created_at > ?').bind(
      email,
      ip,
      since,
    ),
    env.DB.prepare('SELECT COUNT(*) AS count FROM auth_challenges WHERE email = ? AND created_at > ?').bind(email, since),
    env.DB.prepare('SELECT COUNT(*) AS count FROM auth_challenges WHERE ip = ? AND created_at > ?').bind(ip, since),
  ])
  if (
    (byEmailAndIp?.results[0]?.count ?? 0) >= MAX_CHALLENGES_PER_EMAIL_AND_IP ||
    (byEmail?.results[0]?.count ?? 0) >= MAX_CHALLENGES_PER_EMAIL ||
    (byIp?.results[0]?.count ?? 0) >= MAX_CHALLENGES_PER_IP
  ) {
    throw new HttpError(429, 'rate_limited', 'Too many sign-in codes requested. Try again later.')
  }

  const challengeId = newId()
  const code = randomCode()
  await env.DB.prepare(
    'INSERT INTO auth_challenges (id, email, code_hash, ip, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(challengeId, email, await sha256(`${challengeId}:${code}`), ip, now + CHALLENGE_TTL_MS, now)
    .run()

  let delivery
  try {
    delivery = await sendSignInCode(env, email, code)
  } catch (error) {
    console.error('Sign-in email delivery failed', error)
    // An undelivered code must not count toward the rate limit.
    await env.DB.prepare('DELETE FROM auth_challenges WHERE id = ?').bind(challengeId).run()
    throw new HttpError(502, 'email_failed', 'The sign-in email could not be sent. Try again later.')
  }
  // The response is identical for new and existing addresses, so it cannot
  // be used to discover who has an account.
  return {
    challengeId,
    expiresAt: new Date(now + CHALLENGE_TTL_MS).toISOString(),
    ...(delivery === 'logged' && !isProduction(env) ? { debugCode: code } : {}),
  }
}

export async function verifyEmailChallenge(env: Env, challengeIdInput: unknown, codeInput: unknown) {
  const challengeId = typeof challengeIdInput === 'string' ? challengeIdInput : ''
  const code = typeof codeInput === 'string' ? codeInput.replace(/\s/g, '') : ''
  const row = await env.DB.prepare(
    'SELECT id, email, code_hash, attempts, expires_at, used_at FROM auth_challenges WHERE id = ?',
  )
    .bind(challengeId)
    .first<{ id: string; email: string; code_hash: string; attempts: number; expires_at: number; used_at: number | null }>()
  if (!row || row.used_at || row.expires_at <= Date.now()) {
    throw new HttpError(400, 'code_expired', 'This code has expired. Request a new one.')
  }
  if (row.attempts >= MAX_CHALLENGE_ATTEMPTS) {
    throw new HttpError(429, 'code_locked', 'Too many attempts. Request a new code.')
  }
  if (!/^\d{6}$/.test(code) || !timingSafeEqual(await sha256(`${row.id}:${code}`), row.code_hash)) {
    await env.DB.prepare('UPDATE auth_challenges SET attempts = attempts + 1 WHERE id = ?').bind(row.id).run()
    throw new HttpError(400, 'invalid_code', 'That code is not correct.')
  }
  // The conditional update makes the code single-use even if two
  // verifications race.
  const consumed = await env.DB.prepare('UPDATE auth_challenges SET used_at = ? WHERE id = ? AND used_at IS NULL')
    .bind(Date.now(), row.id)
    .run()
  if (!consumed.meta.changes) throw new HttpError(400, 'code_expired', 'This code has expired. Request a new one.')
  return getOrCreateUser(env, row.email)
}

// ---------------------------------------------------------------------------
// Google and Apple OAuth

type OAuthIdentity = {
  providerUserId: string
  email: string
  emailVerified: boolean
  displayName?: string | null
}

type OAuthAdapter = {
  authorizeUrl(redirectUri: string, state: string): string
  exchangeCode(code: string, redirectUri: string): Promise<OAuthIdentity>
}

async function postForm(url: string, form: Record<string, string>) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(form),
  })
  if (!response.ok) throw new Error(`Token exchange failed with ${response.status}: ${await response.text()}`)
  return (await response.json()) as Record<string, unknown>
}

function decodeJwtPayload(token: string) {
  const payload = token.split('.')[1]
  if (!payload) throw new Error('Malformed id_token.')
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(payload))) as Record<string, unknown>
}

// The id_token is not verified against Google's JWKS. Trust comes from
// calling the userinfo endpoint over TLS with the access token from this
// same server-to-server exchange, as in GatherEasy's GoogleOAuthProvider.
function googleAdapter(clientId: string, clientSecret: string): OAuthAdapter {
  return {
    authorizeUrl(redirectUri, state) {
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        access_type: 'online',
        prompt: 'select_account',
      })
      return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
    },
    async exchangeCode(code, redirectUri) {
      const token = await postForm('https://oauth2.googleapis.com/token', {
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      })
      const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${String(token.access_token)}` },
      })
      if (!response.ok) throw new Error(`Google userinfo failed with ${response.status}`)
      const info = (await response.json()) as Record<string, unknown>
      return {
        providerUserId: String(info.sub),
        email: String(info.email ?? ''),
        emailVerified: info.email_verified === true,
        displayName: typeof info.name === 'string' ? info.name : null,
      }
    },
  }
}

function pemToPkcs8(pem: string) {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '')
  return Uint8Array.from(atob(body), (char) => char.charCodeAt(0))
}

// Apple requires the client secret to be an ES256 JWT signed with the
// developer key. WebCrypto's ECDSA output is already the raw r||s pair that
// JWS expects, so no DER unpacking is needed here.
async function appleClientSecret(clientId: string, teamId: string, keyId: string, privateKey: string) {
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(privateKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const issuedAt = Math.floor(Date.now() / 1000)
  const header = base64UrlEncode(JSON.stringify({ alg: 'ES256', kid: keyId }))
  const payload = base64UrlEncode(
    JSON.stringify({ iss: teamId, iat: issuedAt, exp: issuedAt + 300, aud: 'https://appleid.apple.com', sub: clientId }),
  )
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(`${header}.${payload}`),
  )
  return `${header}.${payload}.${base64UrlEncode(signature)}`
}

// Apple has no userinfo endpoint; identity comes from the id_token returned
// by this direct server-to-server exchange, with issuer, audience and expiry
// checked. Apple requires response_mode=form_post when requesting email.
function appleAdapter(clientId: string, teamId: string, keyId: string, privateKey: string): OAuthAdapter {
  return {
    authorizeUrl(redirectUri, state) {
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        response_mode: 'form_post',
        scope: 'name email',
        state,
      })
      return `https://appleid.apple.com/auth/authorize?${params}`
    },
    async exchangeCode(code, redirectUri) {
      const token = await postForm('https://appleid.apple.com/auth/token', {
        code,
        client_id: clientId,
        client_secret: await appleClientSecret(clientId, teamId, keyId, privateKey),
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      })
      const claims = decodeJwtPayload(String(token.id_token ?? ''))
      if (claims.iss !== 'https://appleid.apple.com' || claims.aud !== clientId) {
        throw new Error('Apple id_token failed issuer/audience validation.')
      }
      if (typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) throw new Error('Apple id_token expired.')
      return {
        providerUserId: String(claims.sub),
        email: String(claims.email ?? ''),
        emailVerified: claims.email_verified === true || claims.email_verified === 'true',
      }
    },
  }
}

// Development fallback when a provider has no credentials: the "authorize
// URL" is our own callback, which completes immediately with a fixed
// identity. Never offered in production.
function localAdapter(provider: OAuthProviderName): OAuthAdapter {
  return {
    authorizeUrl(redirectUri, state) {
      return `${redirectUri}?${new URLSearchParams({ code: `local-${provider}`, state })}`
    },
    async exchangeCode() {
      return {
        providerUserId: `local-${provider}-user`,
        email: `${provider}-dev@guitareasy.local`,
        emailVerified: true,
        displayName: `${provider === 'google' ? 'Google' : 'Apple'} Dev`,
      }
    },
  }
}

function oauthAdapter(env: Env, provider: string): OAuthAdapter | undefined {
  if (provider === 'google') {
    if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
      return googleAdapter(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET)
    }
    return isProduction(env) ? undefined : localAdapter('google')
  }
  if (provider === 'apple') {
    if (env.APPLE_CLIENT_ID && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY) {
      return appleAdapter(env.APPLE_CLIENT_ID, env.APPLE_TEAM_ID, env.APPLE_KEY_ID, env.APPLE_PRIVATE_KEY)
    }
    return isProduction(env) ? undefined : localAdapter('apple')
  }
  return undefined
}

// Only providers that can actually complete a sign-in are offered, so the
// dialog never renders a button that would fail on click.
export function availableOAuthProviders(env: Env): OAuthProviderName[] {
  return (['google', 'apple'] as const).filter((provider) => oauthAdapter(env, provider))
}

function oauthRedirectUri(env: Env, request: Request, provider: string) {
  return `${publicOrigin(env, request)}/api/auth/oauth/${provider}/callback`
}

type OAuthState = { provider: string; returnTo: string; nonceHash: string; expiresAt: number }

// The nonce cookie binds the callback to the browser that started the flow:
// a stolen callback URL alone cannot sign a victim into the attacker's
// account. SameSite=None is needed because Apple's callback is a cross-site
// POST; plain-http local development falls back to Lax.
function nonceCookie(env: Env, request: Request, value: string, maxAge: number) {
  const secure = usesSecureCookies(env, request)
  return serializeCookie(OAUTH_NONCE_COOKIE, value, {
    maxAge,
    path: OAUTH_NONCE_COOKIE_PATH,
    secure,
    sameSite: secure ? 'None' : 'Lax',
  })
}

export async function startOAuth(env: Env, request: Request, provider: string, returnToInput: unknown) {
  const adapter = oauthAdapter(env, provider)
  if (!adapter) throw new HttpError(404, 'provider_unavailable', 'That sign-in option is not available.')
  const nonce = randomToken(24)
  const state = await signPayload(authSecret(env), {
    provider,
    returnTo: safeReturnPath(returnToInput),
    nonceHash: await sha256(nonce),
    expiresAt: Date.now() + OAUTH_STATE_TTL_MS,
  } satisfies OAuthState)
  const headers = new Headers({ Location: adapter.authorizeUrl(oauthRedirectUri(env, request, provider), state) })
  headers.append('Set-Cookie', nonceCookie(env, request, nonce, OAUTH_STATE_TTL_MS / 1000))
  return new Response(null, { status: 302, headers })
}

function signInErrorRedirect(env: Env, request: Request, code: string, returnTo = '/') {
  const url = new URL(returnTo, publicOrigin(env, request))
  url.searchParams.set('auth_error', code)
  const headers = new Headers({ Location: url.toString() })
  headers.append('Set-Cookie', nonceCookie(env, request, '', 0))
  return new Response(null, { status: 302, headers })
}

async function linkOAuthIdentity(env: Env, provider: string, identity: OAuthIdentity) {
  const link = await env.DB.prepare(
    'SELECT user_id FROM oauth_identities WHERE provider = ? AND provider_user_id = ?',
  )
    .bind(provider, identity.providerUserId)
    .first<{ user_id: string }>()
  if (link) {
    const user = await getUser(env, link.user_id)
    if (user) return user
  }
  // An unverified provider email would let someone claim an address they do
  // not own, and email is how accounts are matched across sign-in methods.
  if (!identity.emailVerified || !identity.email) throw new HttpError(400, 'email_unverified', 'Email not verified.')
  const user = await getOrCreateUser(env, normalizeEmail(identity.email), identity.displayName)
  await env.DB.prepare(
    'INSERT OR REPLACE INTO oauth_identities (provider, provider_user_id, user_id, email, created_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(provider, identity.providerUserId, user.id, identity.email, Date.now())
    .run()
  return user
}

export async function completeOAuth(env: Env, request: Request, provider: string) {
  let params: URLSearchParams
  if (request.method === 'POST') {
    const form = await request.formData()
    params = new URLSearchParams()
    for (const [key, value] of form) if (typeof value === 'string') params.set(key, value)
  } else {
    params = new URL(request.url).searchParams
  }

  const state = await verifyPayload<OAuthState>(authSecret(env), params.get('state') ?? '')
  const returnTo = safeReturnPath(state?.returnTo)
  if (params.get('error')) return signInErrorRedirect(env, request, 'oauth_denied', returnTo)
  const code = params.get('code')
  const nonce = parseCookies(request).get(OAUTH_NONCE_COOKIE)
  if (
    !state ||
    !code ||
    state.provider !== provider ||
    state.expiresAt <= Date.now() ||
    !nonce ||
    !timingSafeEqual(await sha256(nonce), state.nonceHash)
  ) {
    return signInErrorRedirect(env, request, 'oauth_state_invalid', returnTo)
  }
  const adapter = oauthAdapter(env, provider)
  if (!adapter) return signInErrorRedirect(env, request, 'provider_unavailable', returnTo)

  let user: User
  try {
    const identity = await adapter.exchangeCode(code, oauthRedirectUri(env, request, provider))
    user = await linkOAuthIdentity(env, provider, identity)
  } catch (error) {
    console.error(`${provider} sign-in failed`, error)
    const errorCode = error instanceof HttpError ? error.code : 'oauth_failed'
    return signInErrorRedirect(env, request, errorCode, returnTo)
  }

  const headers = new Headers({ Location: new URL(returnTo, publicOrigin(env, request)).toString() })
  headers.append('Set-Cookie', await createSessionCookie(env, request, user.id))
  headers.append('Set-Cookie', nonceCookie(env, request, '', 0))
  return new Response(null, { status: 302, headers })
}
