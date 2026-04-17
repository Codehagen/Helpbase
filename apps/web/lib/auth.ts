import { betterAuth } from "better-auth"
import { bearer } from "better-auth/plugins/bearer"
import { magicLink } from "better-auth/plugins/magic-link"
import { deviceAuthorization } from "better-auth/plugins/device-authorization"
import { Pool } from "pg"
import { Resend } from "resend"
import { SignInMagicLinkEmail } from "@/emails/sign-in-magic-link"

const DATABASE_URL = process.env.DATABASE_URL
const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "helpbase <login@helpbase.dev>"

// Social providers are opt-in: the config block is only added when BOTH
// the client id and secret are present in env. Lets us deploy the code
// without the OAuth apps being created yet, and lets teammates run
// locally without setting up their own OAuth clients.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET

export const authProviders = {
  google: Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET),
  github: Boolean(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET),
} as const

type SocialProvidersConfig = NonNullable<Parameters<typeof betterAuth>[0]["socialProviders"]>

function buildSocialProviders(): SocialProvidersConfig {
  const providers: SocialProvidersConfig = {}
  if (authProviders.google) {
    providers.google = {
      clientId: GOOGLE_CLIENT_ID!,
      clientSecret: GOOGLE_CLIENT_SECRET!,
    }
  }
  if (authProviders.github) {
    providers.github = {
      clientId: GITHUB_CLIENT_ID!,
      clientSecret: GITHUB_CLIENT_SECRET!,
    }
  }
  return providers
}

// Guards fire at runtime (server-side request handling), not during
// `next build` static page-data collection. NEXT_PHASE is set to
// 'phase-production-build' by Next.js during build so we can distinguish
// the two. Without this gate, CI without prod secrets can't build at all,
// and Vercel's build step would fail before ever getting to runtime.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build"
const isRuntimeProd = process.env.NODE_ENV === "production" && !isBuildPhase

if (!DATABASE_URL) {
  if (isRuntimeProd) {
    // Runtime miss — every auth request would 500 against a pool built
    // from undefined. Surfaces on first request to /api/auth/* instead
    // of at module load, so the rest of the site still serves pages.
    throw new Error(
      "DATABASE_URL is required in production. Supabase → Project Settings → " +
      "Database → Connection string. Use the 'session' / direct connection.",
    )
  }
  // eslint-disable-next-line no-console
  console.warn(
    "[auth] DATABASE_URL not set. /api/auth/* will 500 until you set it " +
    "in apps/web/.env.local (or Vercel env for prod).",
  )
}

if (!RESEND_API_KEY && isRuntimeProd) {
  // Without a mail provider in prod, the dev fallback would print live
  // magic-link URLs to Vercel Runtime Logs — anyone with log access could
  // harvest sign-in URLs. Fail boot instead.
  throw new Error(
    "RESEND_API_KEY is required in production. Get one at resend.com/api-keys " +
    "and add it to the Vercel project env.",
  )
}

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null

// Keep in sync with the magicLink plugin's `expiresIn` below. Used both by
// the email template copy and the text fallback so they never drift.
const MAGIC_LINK_EXPIRES_MINUTES = 10

async function deliverMagicLink(email: string, url: string): Promise<void> {
  if (resend) {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: "Sign in to helpbase",
      // Resend renders the React component to HTML server-side. The `text`
      // fallback is kept explicit (rather than letting Resend auto-generate
      // one from the component) so plain-text-only clients get copy tuned
      // for that surface — no stripped-down HTML leftovers.
      react: SignInMagicLinkEmail({
        url,
        email,
        expiresInMinutes: MAGIC_LINK_EXPIRES_MINUTES,
      }),
      text:
        `Sign in to helpbase\n\n` +
        `Click the link below to continue:\n${url}\n\n` +
        `This link expires in ${MAGIC_LINK_EXPIRES_MINUTES} minutes.\n` +
        `If you didn't request this email, you can ignore it.`,
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
  socialProviders: buildSocialProviders(),
  plugins: [
    bearer(),
    magicLink({
      // Keep in sync with MAGIC_LINK_EXPIRES_MINUTES above (the email copy
      // references it). Better Auth's default 300s is tight for mobile mail
      // delivery; 10m gives most carriers a comfortable window.
      expiresIn: MAGIC_LINK_EXPIRES_MINUTES * 60,
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
