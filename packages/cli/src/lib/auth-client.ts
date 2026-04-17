/**
 * Lightweight REST client for helpbase.dev's Better Auth endpoints.
 *
 * The CLI used to depend on `@supabase/supabase-js` to run magic-link OTP
 * against Supabase. As of 2026-04-17 auth moved to Better Auth (see
 * apps/web/lib/auth.ts). The CLI now speaks directly to Better Auth's
 * HTTP endpoints via native fetch — we intentionally skip the
 * `better-auth/client` package to keep the CLI dep tree lean (a 5-LOC
 * fetch wrapper beats pulling in the full auth framework on every dlx).
 *
 * Endpoints used:
 *   POST /api/auth/sign-in/magic-link   { email, callbackURL? }
 *   GET  /api/auth/magic-link/verify?token=<t>   → 302 + Set-Auth-Token: <bearer>
 *   GET  /api/auth/get-session          Authorization: Bearer <t>
 *
 * Base URL:
 *   HELPBASE_BASE_URL env (dev override, e.g. http://localhost:3001)
 *   falls back to https://helpbase.dev in prod.
 */

export interface BetterAuthUser {
  id: string
  email: string
  name: string
  emailVerified: boolean
  image: string | null
  createdAt: string
  updatedAt: string
}

export interface BetterAuthSession {
  id: string
  token: string
  userId: string
  expiresAt: string
  ipAddress?: string | null
  userAgent?: string | null
}

export interface SessionResponse {
  user: BetterAuthUser
  session: BetterAuthSession
}

const DEFAULT_BASE = "https://helpbase.dev"

/**
 * Trim an untrusted server response body to a short, token-safe snippet
 * before splicing it into a user-facing error message. The server should
 * never echo a bearer or verification token, but if it does (misconfigured
 * middleware, an echo-server used for debugging) we'd otherwise leak it
 * into CLI stderr + the opt-in telemetry pipeline.
 *
 * Redacts any run of >=24 URL-safe base64 / base64url characters — matches
 * the shape of Better Auth sessionId.signature tokens, device codes, and
 * magic-link verification tokens.
 */
function safeSnippet(body: string): string {
  return body.slice(0, 200).replace(/[A-Za-z0-9_+/=-]{24,}/g, "[redacted]")
}

export function getAuthBaseUrl(): string {
  const override = process.env.HELPBASE_BASE_URL?.trim()
  return (override && override.length > 0 ? override : DEFAULT_BASE).replace(/\/+$/, "")
}

function authUrl(path: string): string {
  return `${getAuthBaseUrl()}/api/auth${path.startsWith("/") ? path : `/${path}`}`
}

/**
 * Fire a magic-link sign-in. Server sends the email via Resend (prod) or
 * prints the link to the dev server's stderr (local). Callback URL is a
 * no-op for the CLI path — the user pastes the URL back; the CLI hits
 * `/verify` directly to complete.
 */
export async function sendMagicLink(email: string): Promise<void> {
  const res = await fetch(authUrl("/sign-in/magic-link"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email,
      // Still required by Better Auth even when we consume the verify link
      // ourselves; it sets the Location on the 302 but the CLI ignores it.
      callbackURL: "/",
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`magic-link request failed (${res.status}): ${safeSnippet(text)}`)
  }
}

/**
 * Consume a Better Auth magic-link verification URL OR just the token
 * parameter extracted from it. Returns the bearer token the server mints,
 * which is identical to session.token in the database.
 *
 * The URL may carry helpbase.dev's prod host even in dev; we extract just
 * the `token` query param and re-issue the GET against getAuthBaseUrl()
 * so local dev + prod follow the same code path.
 */
export async function consumeMagicLink(urlOrToken: string): Promise<string> {
  const token = extractVerificationToken(urlOrToken)
  if (!token) {
    throw new Error("Couldn't find a verification token in the URL.")
  }
  const res = await fetch(
    authUrl(`/magic-link/verify?token=${encodeURIComponent(token)}&callbackURL=/`),
    {
      method: "GET",
      redirect: "manual", // we want the 302 + auth-token header, not the browser target
    },
  )
  if (res.status !== 302 && !res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`magic-link verify failed (${res.status}): ${safeSnippet(text)}`)
  }
  const bearer = res.headers.get("set-auth-token")
  if (!bearer) {
    throw new Error(
      "Server accepted the magic link but did not return a bearer token. " +
      "This means the link was already used or expired.",
    )
  }
  return bearer
}

/**
 * RFC 8628 device authorization grant.
 *
 *   startDeviceAuth()                     → POST /api/auth/device/code
 *   pollDeviceAuth(deviceCode, interval)  → POST /api/auth/device/token
 *
 * The server is Better Auth's `deviceAuthorization` plugin (see
 * apps/web/lib/auth.ts). The CLI never needs a bearer token until the
 * flow completes; polling is unauthenticated and the plugin gates
 * issuance on the user having Authorize'd the userCode in a browser.
 */

export interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  verification_uri_complete: string
  expires_in: number
  interval: number
}

export type DevicePollError =
  | "authorization_pending"
  | "slow_down"
  | "access_denied"
  | "expired_token"
  | "invalid_request"
  | "invalid_grant"

export async function startDeviceAuth(
  clientId = "helpbase-cli",
): Promise<DeviceCodeResponse> {
  const res = await fetch(authUrl("/device/code"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: clientId, scope: "openid profile email" }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`device/code failed (${res.status}): ${safeSnippet(text)}`)
  }
  return (await res.json()) as DeviceCodeResponse
}

/**
 * One poll tick. Returns either a bearer token string (issued) or an
 * error code the caller loops on. Never throws for protocol errors —
 * only for transport / JSON failures.
 */
export async function pollDeviceAuth(
  deviceCode: string,
  clientId = "helpbase-cli",
): Promise<{ accessToken: string } | { error: DevicePollError; description?: string }> {
  const res = await fetch(authUrl("/device/token"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: deviceCode,
      client_id: clientId,
    }),
  })
  const text = await res.text()
  let body: unknown
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    throw new Error(`device/token: bad JSON (${res.status}): ${safeSnippet(text)}`)
  }
  if (res.ok) {
    const obj = body as { access_token?: string }
    if (obj.access_token) return { accessToken: obj.access_token }
    throw new Error(`device/token: 2xx without access_token: ${safeSnippet(text)}`)
  }
  // Plugin returns RFC-shaped errors under non-2xx status.
  const err = body as { error?: DevicePollError; error_description?: string } | null
  if (err?.error) {
    return { error: err.error, description: err.error_description }
  }
  throw new Error(`device/token: ${res.status} ${safeSnippet(text)}`)
}

/**
 * Fetch the session behind a bearer token. Returns null if the token is
 * invalid or expired. Never throws for auth failures — callers use the
 * null return to decide whether to re-prompt login.
 */
export async function getSessionWithBearer(bearer: string): Promise<SessionResponse | null> {
  const res = await fetch(authUrl("/get-session"), {
    headers: { authorization: `Bearer ${bearer}` },
  })
  if (!res.ok) return null
  const text = await res.text()
  if (!text || text === "null") return null
  try {
    const parsed = JSON.parse(text) as SessionResponse | null
    if (!parsed?.user || !parsed.session) return null
    return parsed
  } catch {
    return null
  }
}

function extractVerificationToken(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  // If the input is already a bare token (no URL shape), accept as-is.
  if (!/[?#/]/.test(trimmed) && /^[A-Za-z0-9_-]+$/.test(trimmed) && trimmed.length >= 16) {
    return trimmed
  }
  // Otherwise parse as URL. Supabase-style fragments had `?`/`#` — Better
  // Auth uses a plain query string, so prefer query over fragment but fall
  // back for robustness.
  try {
    const u = new URL(trimmed)
    const q = u.searchParams.get("token")
    if (q) return q
    if (u.hash) {
      const frag = new URLSearchParams(u.hash.slice(1))
      const f = frag.get("token")
      if (f) return f
    }
    return null
  } catch {
    // Fallback: plain substring extraction for pasted fragments without a
    // valid scheme (some email clients mangle URLs).
    const m = /[?&#]token=([A-Za-z0-9_-]+)/.exec(trimmed)
    return m ? m[1]! : null
  }
}
