import { betterAuth } from "better-auth"
import { bearer } from "better-auth/plugins/bearer"
import { magicLink } from "better-auth/plugins/magic-link"
import { deviceAuthorization } from "better-auth/plugins/device-authorization"
import { Pool } from "pg"
import { Resend } from "resend"

const DATABASE_URL = process.env.DATABASE_URL
const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "helpbase <login@helpbase.dev>"

if (!DATABASE_URL) {
  // In prod, this is fatal — every auth request would 500 against a pool
  // built from undefined. Fail loud so the Vercel build surfaces it.
  // In dev we only warn; contributors can run the docs site + non-auth
  // routes without a DB if they're iterating on MDX or the web UI.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "DATABASE_URL is required in production. Supabase → Project Settings → " +
      "Database → Connection string. Use the 'session' / direct connection.",
    )
  }
  // eslint-disable-next-line no-console
  console.warn(
    "[auth] DATABASE_URL not set. /api/auth/* will 500 until you set it " +
    "in apps/web/.env.local.",
  )
}

if (!RESEND_API_KEY && process.env.NODE_ENV === "production") {
  // Without a mail provider in prod, the dev fallback would print live
  // magic-link URLs to Vercel Runtime Logs — anyone with log access could
  // harvest sign-in URLs. Fail boot instead.
  throw new Error(
    "RESEND_API_KEY is required in production. Get one at resend.com/api-keys " +
    "and add it to the Vercel project env.",
  )
}

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null

async function deliverMagicLink(email: string, url: string): Promise<void> {
  if (resend) {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: "Sign in to helpbase",
      text:
        `Click the link below to sign in:\n\n${url}\n\n` +
        `This link expires in 10 minutes. If you didn't request this, ignore this email.`,
    })
    if (error) {
      // Let Better Auth surface the error to the caller. The CLI's
      // E_LOGIN_RESEND_DOWN code maps to this path via the plugin's error
      // response; downstream we log structured telemetry.
      throw new Error(`Resend delivery failed: ${error.message ?? String(error)}`)
    }
    return
  }

  // Dev-mode fallback: no Resend key configured, print the sign-in URL to
  // stderr so local devs can click it from their terminal without signing
  // up for a mail provider. Belt-and-suspenders: also gate on NODE_ENV
  // so a misconfigured prod deploy (somehow missed the boot-time check
  // above) refuses to leak the URL — it fails loudly instead.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "RESEND_API_KEY missing in production — refusing to print magic-link " +
      "URL to stderr. Set RESEND_API_KEY in the Vercel env.",
    )
  }
  // eslint-disable-next-line no-console
  console.error(
    "\n─── DEV MAGIC LINK ───────────────────────────────────────────\n" +
    `  to: ${email}\n` +
    `  link: ${url}\n` +
    "  (set RESEND_API_KEY in .env.local to send real emails)\n" +
    "──────────────────────────────────────────────────────────────\n",
  )
}

export const auth = betterAuth({
  database: new Pool({ connectionString: DATABASE_URL }),
  plugins: [
    bearer(),
    magicLink({
      expiresIn: 600, // 10 minutes; Better Auth default is 300 which is tight for mobile mail delivery
      sendMagicLink: async ({ email, url }) => {
        await deliverMagicLink(email, url)
      },
    }),
    deviceAuthorization({
      // RFC 8628 device grant. `helpbase login` kicks this off from the
      // CLI; the browser lands at <BETTER_AUTH_URL>/device?user_code=...
      // where the user compares the code to what the CLI printed and
      // clicks Authorize. Plugin owns the atomic consume, expiry, and
      // polling rate-limit (slow_down / authorization_pending).
      verificationUri: "/device",
      expiresIn: "10m",    // longer than default 30m would be gratuitous
      interval: "2s",      // matches our plan's stated polling cadence
    }),
  ],
  trustedOrigins: [
    "https://helpbase.dev",
    "http://localhost:3000",
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "",
  ].filter(Boolean),
})

export type Session = typeof auth.$Infer.Session
