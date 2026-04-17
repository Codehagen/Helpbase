import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { HelpbaseError } from "./errors.js"
import {
  consumeMagicLink,
  getSessionWithBearer,
  sendMagicLink as apiSendMagicLink,
  type SessionResponse,
} from "./auth-client.js"

/**
 * Provider-agnostic auth layer.
 *
 * As of 2026-04-17 the CLI authenticates against Better Auth (via
 * helpbase.dev/api/auth/*) instead of calling Supabase directly. The
 * AuthSession surface, ~/.helpbase/auth.json format, and HELPBASE_TOKEN
 * env var contract are all preserved so the rest of the CLI — and any
 * downstream user automation — sees no breaking change.
 *
 * Known deviation from the pre-migration behavior: Better Auth bearer
 * tokens are opaque strings (not JWTs) and there is no refresh token.
 * refreshToken is kept in the session object as an empty string for
 * backwards-compat with the on-disk JSON shape. When the token expires
 * (7 days by default), getCurrentSession returns null and callers
 * prompt for a fresh `helpbase login`.
 */

export interface AuthSession {
  userId: string
  email: string
  accessToken: string
  refreshToken: string
  expiresAt: number
}

const AUTH_DIR = path.join(os.homedir(), ".helpbase")
const AUTH_FILE = path.join(AUTH_DIR, "auth.json")
const TOKEN_ENV = "HELPBASE_TOKEN"

/**
 * Resolve the current auth session.
 *
 * Resolution order:
 *   1. HELPBASE_TOKEN env var (for CI / non-interactive).
 *   2. ~/.helpbase/auth.json (interactive login).
 *
 * Returns null if neither source produces a valid session. Callers treat
 * null as "prompt for fresh login". A non-null result has been validated
 * against the server at least once in the current invocation.
 */
export async function getCurrentSession(): Promise<AuthSession | null> {
  const envToken = process.env[TOKEN_ENV]
  if (envToken) {
    return resolveTokenSession(envToken)
  }

  const stored = loadStoredSession()
  if (!stored) return null

  const resp = await getSessionWithBearer(stored.accessToken)
  if (!resp) {
    clearStoredSession()
    return null
  }

  // Session token may have been rotated server-side; mirror any change to disk.
  const refreshed = toAuthSession(resp, stored.accessToken)
  if (
    refreshed.userId !== stored.userId ||
    refreshed.email !== stored.email ||
    refreshed.expiresAt !== stored.expiresAt
  ) {
    storeSession(refreshed)
  }
  return refreshed
}

/**
 * Start an interactive login by sending a magic-link email. Resend in
 * prod, dev-console-fallback in local dev — see apps/web/lib/auth.ts.
 */
export async function sendLoginCode(email: string): Promise<void> {
  try {
    await apiSendMagicLink(email)
  } catch (err) {
    throw new HelpbaseError({
      code: "E_AUTH_SEND_OTP",
      problem: "Could not send the login link",
      cause: err instanceof Error ? err.message : String(err),
      fix: [
        "Check the email address for typos",
        "Wait a minute if you just requested a link — rate limits apply",
        "Try `helpbase login` again",
      ],
    })
  }
}

/**
 * Consume a pasted Better Auth magic-link URL (or bare token). Calls
 * /api/auth/magic-link/verify, extracts the set-auth-token response
 * header, and persists the resulting session to ~/.helpbase/auth.json.
 *
 * Exposed as an async function now (pre-migration it was synchronous URL
 * parsing only). Callers must `await`.
 */
export async function verifyLoginFromMagicLink(url: string): Promise<AuthSession> {
  let bearer: string
  try {
    bearer = await consumeMagicLink(url)
  } catch (err) {
    throw new HelpbaseError({
      code: "E_AUTH_VERIFY_OTP",
      problem: "Couldn't complete sign-in from that link",
      cause: err instanceof Error ? err.message : String(err),
      fix: [
        "Copy the full URL from the email — everything after `?` matters",
        "Run `helpbase login` again if the link expired (10-minute TTL)",
      ],
    })
  }
  const resp = await getSessionWithBearer(bearer)
  if (!resp) {
    throw new HelpbaseError({
      code: "E_AUTH_VERIFY_OTP",
      problem: "Server accepted the link but no session came back",
      cause: "getSession returned null with a freshly-minted bearer",
      fix: ["Run `helpbase login` again", "Check helpbase.dev status"],
    })
  }
  const session = toAuthSession(resp, bearer)
  storeSession(session)
  return session
}

// deviceLogin + DeviceLoginOptions moved to ./auth-device.ts on 2026-04-17
// as part of the /review split. They're re-exported here for backwards
// compatibility with callers that imported from "./lib/auth".
export { deviceLogin, type DeviceLoginOptions } from "./auth-device.js"

/**
 * Legacy 6-digit OTP path from the Supabase era. Better Auth's magic-link
 * plugin does not mint numeric codes — the token in the email IS the
 * verification artifact, and only works when fed through
 * verifyLoginFromMagicLink.
 *
 * Kept as a stub so the login command's existing branch still compiles;
 * callers that hit this receive a clear "not supported" message.
 */
export async function verifyLoginCode(_email: string, _code: string): Promise<AuthSession> {
  throw new HelpbaseError({
    code: "E_AUTH_VERIFY_OTP",
    problem: "6-digit code login is no longer supported",
    cause: "The helpbase auth backend moved to browser device-flow + magic-link URLs",
    fix: [
      "Paste the full URL from your sign-in email instead",
      "Or upgrade to helpbase@0.5.0+ and use `helpbase login` (browser device-flow)",
    ],
  })
}

/**
 * Clear the local session (logout).
 */
export function logout(): void {
  clearStoredSession()
}

/**
 * True if a HELPBASE_TOKEN is present in the environment.
 * Callers use this to decide whether interactive prompts are allowed.
 */
export function isNonInteractive(): boolean {
  return Boolean(process.env[TOKEN_ENV])
}

// ── internal ───────────────────────────────────────────────────

interface StoredAuth {
  user_id: string
  email: string
  access_token: string
  refresh_token: string
  expires_at: number
}

export function storeSession(session: AuthSession): void {
  if (!fs.existsSync(AUTH_DIR)) {
    // 0o700 on the dir so only the current user can traverse it.
    fs.mkdirSync(AUTH_DIR, { recursive: true, mode: 0o700 })
  }
  const data: StoredAuth = {
    user_id: session.userId,
    email: session.email,
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
    expires_at: session.expiresAt,
  }
  fs.writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2), { mode: 0o600 })
  // writeFileSync's `mode` is only honored on file creation. If the file
  // already existed (previous login with a loose umask, or pre-created by
  // another user), the mode stays whatever it was. Force-narrow on every
  // write so the bearer is never readable by other local users.
  try {
    fs.chmodSync(AUTH_FILE, 0o600)
  } catch {
    // best-effort — some filesystems (FAT, SMB) don't support chmod
  }
}

/**
 * Build an AuthSession from a freshly-minted bearer + the server's session
 * response. Centralizes the shape-conversion (ISO date → epoch seconds,
 * refreshToken empty-string back-compat) so a future schema change touches
 * one function instead of four call sites.
 */
export function toAuthSession(resp: SessionResponse, bearer: string): AuthSession {
  return {
    userId: resp.user.id,
    email: resp.user.email,
    accessToken: bearer,
    // Better Auth doesn't expose a refresh token to bearer-mode clients;
    // the field is kept as an empty string so the on-disk JSON layout is
    // backwards-compatible with pre-migration installs.
    refreshToken: "",
    expiresAt: Math.floor(new Date(resp.session.expiresAt).getTime() / 1000),
  }
}

function loadStoredSession(): AuthSession | null {
  if (!fs.existsSync(AUTH_FILE)) return null
  try {
    const raw = fs.readFileSync(AUTH_FILE, "utf-8")
    const data = JSON.parse(raw) as StoredAuth
    return {
      userId: data.user_id,
      email: data.email,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? "",
      expiresAt: data.expires_at,
    }
  } catch {
    return null
  }
}

function clearStoredSession(): void {
  if (fs.existsSync(AUTH_FILE)) {
    fs.unlinkSync(AUTH_FILE)
  }
}

/**
 * Resolve a HELPBASE_TOKEN env var into a session. We validate the token
 * against /api/auth/get-session so stale / revoked tokens fail fast with
 * a clear "not logged in" signal instead of silently 401ing downstream.
 */
async function resolveTokenSession(token: string): Promise<AuthSession | null> {
  const resp = await getSessionWithBearer(token)
  if (!resp) return null
  // HELPBASE_TOKEN sessions are not refreshable from the CLI's
  // perspective — they're expected to be long-lived or re-minted by CI.
  return toAuthSession(resp, token)
}
