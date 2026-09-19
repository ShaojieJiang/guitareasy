import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider'

export interface Env {
  DB: D1Database
  SCORES_KV: KVNamespace
  // Storage for MCP OAuth clients, grants, and tokens (read by
  // @cloudflare/workers-oauth-provider under this fixed binding name).
  OAUTH_KV: KVNamespace
  ASSETS: Fetcher
  // Injected by OAuthProvider into the default handler's env.
  OAUTH_PROVIDER: OAuthHelpers

  // "production" disables the local sign-in fallbacks and debug codes.
  ENVIRONMENT?: string
  // Browser-visible origin of the site, e.g. https://guitareasy.app. OAuth
  // redirect URIs and cookie origin checks are derived from it.
  PUBLIC_ORIGIN?: string
  // HMAC key for signed OAuth state. Required in production.
  AUTH_SECRET?: string

  // Sign-in code delivery, named as in GatherEasy. Without SMTP_HOST and
  // SMTP_FROM, development logs codes instead of sending them.
  SMTP_HOST?: string
  SMTP_PORT?: string
  SMTP_USERNAME?: string
  SMTP_PASSWORD?: string
  SMTP_FROM?: string
  SMTP_FROM_NAME?: string
  // "0" disables STARTTLS on non-465 ports.
  SMTP_STARTTLS?: string

  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  APPLE_CLIENT_ID?: string
  APPLE_TEAM_ID?: string
  APPLE_KEY_ID?: string
  APPLE_PRIVATE_KEY?: string
}

export function isProduction(env: Env) {
  return env.ENVIRONMENT === 'production'
}

export function publicOrigin(env: Env, request: Request) {
  return env.PUBLIC_ORIGIN?.replace(/\/$/, '') ?? new URL(request.url).origin
}
