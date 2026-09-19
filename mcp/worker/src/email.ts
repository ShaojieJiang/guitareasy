import { WorkerMailer } from 'worker-mailer'
import { isProduction, type Env } from './env'

export type EmailDelivery = 'sent' | 'logged'

// Sends over SMTP (same SMTP_* settings as GatherEasy) whenever SMTP_HOST
// and SMTP_FROM are set. Without them, development logs the code instead
// (and the API returns it as a debug code) so local sign-in needs no mail
// server; production refuses to start a sign-in it cannot deliver.
export async function sendSignInCode(env: Env, to: string, code: string): Promise<EmailDelivery> {
  if (!env.SMTP_HOST || !env.SMTP_FROM) {
    if (isProduction(env)) throw new Error('SMTP_HOST and SMTP_FROM must be configured in production.')
    console.log(`[dev email] sign-in code for ${to}: ${code}`)
    return 'logged'
  }

  const port = Number(env.SMTP_PORT || 587)
  const implicitTls = port === 465
  const subject = `${code} is your GuitarEasy sign-in code`
  const text = [
    `Your GuitarEasy sign-in code is ${code}.`,
    '',
    'It expires in 10 minutes. If you did not try to sign in, you can ignore this email.',
  ].join('\n')
  const html = `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#1d2029">
<p>Your GuitarEasy sign-in code is</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:12px 0">${code}</p>
<p style="color:#5d626d">It expires in 10 minutes. If you did not try to sign in, you can ignore this email.</p>
</body></html>`

  await WorkerMailer.send(
    {
      host: env.SMTP_HOST,
      port,
      // Port 465 is TLS from the first byte; other ports upgrade with
      // STARTTLS unless SMTP_STARTTLS=0, matching GatherEasy's default.
      secure: implicitTls,
      startTls: !implicitTls && env.SMTP_STARTTLS !== '0',
      credentials:
        env.SMTP_USERNAME && env.SMTP_PASSWORD
          ? { username: env.SMTP_USERNAME, password: env.SMTP_PASSWORD }
          : undefined,
      // worker-mailer offers no auth methods unless listed; allow whichever
      // the server advertises.
      authType: ['plain', 'login', 'cram-md5'],
      socketTimeoutMs: 10_000,
      responseTimeoutMs: 10_000,
    },
    {
      from: { name: env.SMTP_FROM_NAME || 'GuitarEasy', email: env.SMTP_FROM },
      to,
      subject,
      text,
      html,
    },
  )
  return 'sent'
}
