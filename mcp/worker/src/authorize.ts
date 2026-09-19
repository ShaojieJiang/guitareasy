// Browser pages for the MCP OAuth authorization endpoint. An MCP host
// (Claude, ChatGPT, …) sends the user here; they sign in with the same
// Google, Apple, or email-code options as the website, then approve access.
import type { AuthRequest } from '@cloudflare/workers-oauth-provider'
import { availableOAuthProviders, getSessionUser, type User } from './auth'
import { isProduction, publicOrigin, type Env } from './env'
import { escapeHtml, signPayload, verifyPayload } from './util'

const CONSENT_TTL_MS = 10 * 60 * 1000
const DEV_CONSENT_SECRET = 'guitareasy-local-consent-secret'

type ConsentToken = { userId: string; clientId: string; expiresAt: number }

function consentSecret(env: Env) {
  if (env.AUTH_SECRET) return `${env.AUTH_SECRET}:consent`
  if (isProduction(env)) throw new Error('AUTH_SECRET is not configured.')
  return DEV_CONSENT_SECRET
}

const googleIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2-1.9 3.3-4.7 3.3-8Z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.2-2.7l-3.5-2.7c-1 .7-2.2 1-3.7 1-2.8 0-5.2-1.9-6.1-4.5H2.3v2.8A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.9 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.3a11 11 0 0 0 0 9.8l3.6-2.8Z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3 .6 4.1 1.6l3.1-3.1A11 11 0 0 0 2.3 7.1l3.6 2.8C6.8 7.3 9.2 5.4 12 5.4Z"/></svg>`
const appleIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9a4.8 4.8 0 0 0-3.8-2c-1.6-.2-3.1.9-3.9.9-.8 0-2-.9-3.4-.9a5 5 0 0 0-4.2 2.6c-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6 1.3-.1 1.8-.8 3.3-.8 1.6 0 2 .8 3.4.8 1.4 0 2.3-1.3 3.1-2.5a11 11 0 0 0 1.4-2.9 4.5 4.5 0 0 1-2.6-4.1ZM13.9 5a4.5 4.5 0 0 0 1-3.3 4.6 4.6 0 0 0-3 1.6 4.3 4.3 0 0 0-1.1 3.2c1.2 0 2.3-.6 3.1-1.5Z"/></svg>`

function page(title: string, body: string, script = '') {
  return new Response(
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<title>${escapeHtml(title)} · GuitarEasy</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<style>
:root { color-scheme: dark; --bg:#11131a; --panel:#191c25; --ink:#f4f2ed; --muted:#9699a5; --line:rgba(244,242,237,.14); --accent:#a79cff; --accent-ink:#171526; --danger:#ffb0a8; }
@media (prefers-color-scheme: light) { :root { color-scheme: light; --bg:#f1f3f1; --panel:#fff; --ink:#1d2029; --muted:#5d626d; --line:rgba(29,32,41,.14); --accent:#5b4dc1; --accent-ink:#fff; --danger:#a0362e; } }
* { box-sizing: border-box; }
body { margin:0; min-height:100svh; display:grid; place-items:center; padding:24px; background:var(--bg); color:var(--ink); font:15px/1.5 Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
main { width:min(420px, 100%); padding:32px; border:1px solid var(--line); border-radius:15px; background:var(--panel); }
.brand { display:flex; align-items:center; gap:10px; margin-bottom:22px; font-weight:700; }
.brand img { width:24px; height:24px; }
h1 { margin:0 0 8px; font-size:22px; font-weight:600; letter-spacing:-.02em; }
p { margin:0 0 18px; color:var(--muted); }
strong { color:var(--ink); }
.stack { display:grid; gap:10px; }
.button { display:flex; align-items:center; justify-content:center; gap:10px; width:100%; min-height:44px; padding:10px 14px; border:1px solid var(--line); border-radius:9px; background:transparent; color:var(--ink); font:inherit; font-weight:600; text-decoration:none; cursor:pointer; }
.button:hover { border-color:var(--accent); }
.button svg { width:18px; height:18px; }
.primary { border-color:var(--accent); background:var(--accent); color:var(--accent-ink); }
.divider { display:flex; align-items:center; gap:10px; margin:18px 0; color:var(--muted); font-size:12px; }
.divider::before, .divider::after { content:""; flex:1; height:1px; background:var(--line); }
label { display:grid; gap:6px; font-size:13px; font-weight:600; }
input { min-height:44px; padding:10px 12px; border:1px solid var(--line); border-radius:9px; background:transparent; color:var(--ink); font:inherit; }
input:focus-visible, .button:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.error { color:var(--danger); font-size:13px; min-height:1em; margin:10px 0 0; }
.row { display:flex; gap:10px; margin-top:22px; }
.row .button { flex:1; }
[hidden] { display:none !important; }
</style>
</head>
<body><main>
<div class="brand"><img src="/favicon.svg" alt="" />GuitarEasy</div>
${body}
</main>${script ? `<script>${script}</script>` : ''}</body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY' } },
  )
}

const authErrorMessages: Record<string, string> = {
  oauth_denied: 'Sign-in was cancelled.',
  oauth_state_invalid: 'That sign-in attempt expired. Try again.',
  email_unverified: 'That account’s email address is not verified.',
}

function signInPage(env: Env, request: Request, clientName: string) {
  const url = new URL(request.url)
  const authError = url.searchParams.get('auth_error')
  url.searchParams.delete('auth_error')
  const returnTo = `${url.pathname}${url.search}`
  const providers = availableOAuthProviders(env)
  const providerButtons = providers
    .map((provider) => {
      const href = `/api/auth/oauth/${provider}/start?returnTo=${encodeURIComponent(returnTo)}`
      const label = provider === 'google' ? 'Continue with Google' : 'Continue with Apple'
      return `<a class="button" href="${escapeHtml(href)}">${provider === 'google' ? googleIcon : appleIcon}${label}</a>`
    })
    .join('')

  const body = `
<h1>Sign in to continue</h1>
<p><strong>${escapeHtml(clientName)}</strong> wants to connect to your GuitarEasy score library.</p>
${providerButtons ? `<div class="stack">${providerButtons}</div><div class="divider">or use email</div>` : ''}
<form id="email-form" class="stack">
  <label>Email<input id="email" type="email" autocomplete="email" required /></label>
  <button class="button primary" type="submit">Email me a code</button>
</form>
<form id="code-form" class="stack" hidden>
  <p id="code-hint">Enter the 6-digit code we sent you.</p>
  <label>Sign-in code<input id="code" inputmode="numeric" autocomplete="one-time-code" pattern="\\d{6}" maxlength="6" required /></label>
  <button class="button primary" type="submit">Sign in</button>
  <button class="button" id="restart" type="button">Use a different email</button>
</form>
<p class="error" id="error" role="alert">${escapeHtml(authError ? (authErrorMessages[authError] ?? 'Sign-in failed. Try again.') : '')}</p>`

  const script = `
const emailForm = document.getElementById('email-form');
const codeForm = document.getElementById('code-form');
const error = document.getElementById('error');
let challengeId = '';
async function post(path, body) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data.error && data.error.message) || 'Something went wrong.');
  return data;
}
emailForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  error.textContent = '';
  try {
    const data = await post('/api/auth/email/start', { email: document.getElementById('email').value });
    challengeId = data.challengeId;
    if (data.debugCode) document.getElementById('code-hint').textContent = 'Development code: ' + data.debugCode;
    emailForm.hidden = true;
    codeForm.hidden = false;
    document.getElementById('code').focus();
  } catch (e) { error.textContent = e.message; }
});
codeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  error.textContent = '';
  try {
    await post('/api/auth/email/verify', { challengeId, code: document.getElementById('code').value });
    location.reload();
  } catch (e) { error.textContent = e.message; }
});
document.getElementById('restart').addEventListener('click', () => {
  codeForm.hidden = true;
  emailForm.hidden = false;
  error.textContent = '';
});`
  return page('Sign in', body, script)
}

async function consentPage(env: Env, request: Request, user: User, clientId: string, clientName: string) {
  const token = await signPayload(consentSecret(env), {
    userId: user.id,
    clientId,
    expiresAt: Date.now() + CONSENT_TTL_MS,
  } satisfies ConsentToken)
  const url = new URL(request.url)
  const body = `
<h1>Allow access?</h1>
<p><strong>${escapeHtml(clientName)}</strong> will be able to read, save, publish, rate, and comment on scores as <strong>${escapeHtml(user.displayName)}</strong> (${escapeHtml(user.email)}).</p>
<form method="post" action="${escapeHtml(`${url.pathname}${url.search}`)}">
  <input type="hidden" name="consent" value="${escapeHtml(token)}" />
  <div class="row">
    <button class="button" name="decision" value="deny" type="submit">Cancel</button>
    <button class="button primary" name="decision" value="allow" type="submit">Allow</button>
  </div>
</form>
<form method="post" action="/api/auth/logout" id="switch" class="stack" style="margin-top:14px">
  <button class="button" type="submit">Use a different account</button>
</form>`
  const script = `
document.getElementById('switch').addEventListener('submit', async (event) => {
  event.preventDefault();
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  location.reload();
});`
  return page('Allow access', body, script)
}

function redirectWithError(authRequest: AuthRequest, error: string) {
  const redirect = new URL(authRequest.redirectUri)
  redirect.searchParams.set('error', error)
  if (authRequest.state) redirect.searchParams.set('state', authRequest.state)
  return Response.redirect(redirect.toString(), 302)
}

export async function handleAuthorize(request: Request, env: Env): Promise<Response> {
  let authRequest: AuthRequest
  try {
    authRequest = await env.OAUTH_PROVIDER.parseAuthRequest(request)
  } catch (error) {
    return page('Invalid request', `<h1>Invalid request</h1><p>${escapeHtml(error instanceof Error ? error.message : 'This authorization link is not valid.')}</p>`)
  }
  const client = await env.OAUTH_PROVIDER.lookupClient(authRequest.clientId)
  if (!client) return page('Unknown app', '<h1>Unknown app</h1><p>This app is not registered with GuitarEasy.</p>')
  const clientName = client.clientName || 'An AI assistant'

  const user = await getSessionUser(env, request)
  if (request.method === 'GET') {
    return user ? consentPage(env, request, user, client.clientId, clientName) : signInPage(env, request, clientName)
  }
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const origin = request.headers.get('Origin')
  if (origin && origin !== publicOrigin(env, request) && origin !== new URL(request.url).origin) {
    return new Response('Cross-site request rejected', { status: 403 })
  }
  const form = await request.formData()
  const consent = await verifyPayload<ConsentToken>(consentSecret(env), String(form.get('consent') ?? ''))
  if (!user || !consent || consent.userId !== user.id || consent.clientId !== client.clientId || consent.expiresAt <= Date.now()) {
    return user ? consentPage(env, request, user, client.clientId, clientName) : signInPage(env, request, clientName)
  }
  if (form.get('decision') !== 'allow') return redirectWithError(authRequest, 'access_denied')

  const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
    request: authRequest,
    userId: user.id,
    metadata: { label: user.email },
    scope: authRequest.scope,
    props: { userId: user.id },
  })
  return Response.redirect(redirectTo, 302)
}
