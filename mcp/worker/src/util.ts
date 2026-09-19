const encoder = new TextEncoder()

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'no-store')
  return new Response(JSON.stringify(data), { ...init, headers })
}

export function errorResponse(error: unknown) {
  if (error instanceof HttpError) {
    return json({ error: { code: error.code, message: error.message } }, { status: error.status })
  }
  console.error(error)
  return json({ error: { code: 'internal', message: 'Something went wrong. Try again.' } }, { status: 500 })
}

export function newId() {
  return crypto.randomUUID()
}

export function randomToken(bytes = 32) {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(bytes)))
}

export function randomCode() {
  // Rejection sampling keeps every six-digit code equally likely.
  const values = new Uint32Array(1)
  let value: number
  do {
    crypto.getRandomValues(values)
    value = values[0]!
  } while (value >= 4_294_000_000)
  return String(value % 1_000_000).padStart(6, '0')
}

export function base64UrlEncode(input: ArrayBuffer | Uint8Array | string) {
  const bytes =
    typeof input === 'string' ? encoder.encode(input) : input instanceof Uint8Array ? input : new Uint8Array(input)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function base64UrlDecode(input: string) {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false
  let diff = 0
  for (let index = 0; index < left.length; index++) diff |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return diff === 0
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ])
}

// Compact signed payload: base64url(json).base64url(hmac). Used for OAuth
// state, which must survive a round trip through Google/Apple untampered.
export async function signPayload(secret: string, payload: Record<string, unknown>) {
  const body = base64UrlEncode(JSON.stringify(payload))
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(body))
  return `${body}.${base64UrlEncode(signature)}`
}

export async function verifyPayload<T>(secret: string, token: string): Promise<T | undefined> {
  const [body, signature] = token.split('.')
  if (!body || !signature) return undefined
  let valid = false
  try {
    valid = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret),
      base64UrlDecode(signature),
      encoder.encode(body),
    )
  } catch {
    return undefined
  }
  if (!valid) return undefined
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as T
  } catch {
    return undefined
  }
}

export function parseCookies(request: Request) {
  const cookies = new Map<string, string>()
  for (const part of (request.headers.get('Cookie') ?? '').split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    const name = part.slice(0, index).trim()
    if (!name) continue
    // Other cookies on the domain may not be percent-encoded; skip any that
    // fail to decode rather than failing the whole request.
    try {
      cookies.set(name, decodeURIComponent(part.slice(index + 1).trim()))
    } catch {
      // Malformed value; ignore this cookie.
    }
  }
  return cookies
}

export type CookieOptions = {
  maxAge: number
  path?: string
  secure: boolean
  sameSite?: 'Lax' | 'None' | 'Strict'
}

export function serializeCookie(name: string, value: string, options: CookieOptions) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path ?? '/'}`,
    `Max-Age=${Math.max(0, Math.floor(options.maxAge))}`,
    'HttpOnly',
    `SameSite=${options.sameSite ?? 'Lax'}`,
  ]
  if (options.secure) parts.push('Secure')
  return parts.join('; ')
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json()
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>
  } catch {
    // Fall through to the shared error below.
  }
  throw new HttpError(400, 'invalid_body', 'Request body must be a JSON object.')
}

export function clientIp(request: Request) {
  return request.headers.get('CF-Connecting-IP') ?? 'local'
}

// Only same-site relative paths survive a sign-in redirect, so a crafted
// `returnTo` cannot bounce a freshly signed-in user to another site.
export function safeReturnPath(value: unknown, fallback = '/') {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return fallback
  }
  return value
}

export function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
