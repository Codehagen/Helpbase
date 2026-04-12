import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { getAnonSupabase } from "./supabase-client.js"

/**
 * Provider-agnostic auth layer.
 *
 * The CLI currently authenticates against Supabase directly. When helpbase
 * migrates to Better Auth, only this file needs to change — the surface
 * (AuthSession, login/logout/whoami commands, HELPBASE_TOKEN) stays identical.
 *
 * The access token is opaque to callers. They pass it back through
 * getAuthedSupabase() in lib/supabase-client.ts when they need a DB client.
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

export class AuthError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message)
    this.name = "AuthError"
  }
}

/**
 * Resolve the current auth session.
 *
 * Resolution order:
 *   1. HELPBASE_TOKEN env var (for CI / non-interactive).
 *   2. ~/.helpbase/auth.json (interactive login).
 *
 * Returns null if neither source produces a valid session.
 */
export async function getCurrentSession(): Promise<AuthSession | null> {
  const envToken = process.env[TOKEN_ENV]
  if (envToken) {
    return resolveTokenSession(envToken)
  }

  const stored = loadStoredSession()
  if (!stored) return null

  const client = getAnonSupabase()
  const { data, error } = await client.auth.setSession({
    access_token: stored.accessToken,
    refresh_token: stored.refreshToken,
  })

  if (error || !data.session) {
    clearStoredSession()
    return null
  }

  const refreshed: AuthSession = {
    userId: data.session.user.id,
    email: data.session.user.email ?? stored.email,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at ?? stored.expiresAt,
  }

  if (refreshed.accessToken !== stored.accessToken) {
    storeSession(refreshed)
  }

  return refreshed
}

/**
 * Start an interactive login by sending a magic-link OTP to the given email.
 */
export async function sendLoginCode(email: string): Promise<void> {
  const client = getAnonSupabase()
  const { error } = await client.auth.signInWithOtp({ email })
  if (error) {
    throw new AuthError(error.message, "E_AUTH_SEND_OTP")
  }
}

/**
 * Complete an interactive login by verifying the 6-digit code from the email.
 * Stores the resulting session to ~/.helpbase/auth.json.
 */
export async function verifyLoginCode(email: string, code: string): Promise<AuthSession> {
  const client = getAnonSupabase()
  const { data, error } = await client.auth.verifyOtp({
    email,
    token: code,
    type: "email",
  })

  if (error || !data.session) {
    throw new AuthError(
      error?.message ?? "Invalid or expired code",
      "E_AUTH_VERIFY_OTP",
    )
  }

  const session: AuthSession = {
    userId: data.session.user.id,
    email: data.session.user.email ?? email,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at ?? Date.now() / 1000 + 3600,
  }

  storeSession(session)
  return session
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

function storeSession(session: AuthSession): void {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true })
  }
  const data: StoredAuth = {
    user_id: session.userId,
    email: session.email,
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
    expires_at: session.expiresAt,
  }
  fs.writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2), { mode: 0o600 })
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
      refreshToken: data.refresh_token,
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
 * Resolve a HELPBASE_TOKEN env var into a session.
 *
 * Today the token is a raw Supabase access token. We verify it by calling
 * getUser() which fails fast if the token is invalid/expired. When Better
 * Auth lands, this becomes a call to the helpbase.dev /api/auth/verify
 * endpoint — the rest of the CLI does not notice.
 */
async function resolveTokenSession(token: string): Promise<AuthSession | null> {
  const client = getAnonSupabase()
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) {
    return null
  }
  return {
    userId: data.user.id,
    email: data.user.email ?? "",
    accessToken: token,
    // Tokens passed via HELPBASE_TOKEN are not refreshable from the CLI's
    // perspective — they're expected to be long-lived or re-minted by CI.
    refreshToken: "",
    expiresAt: 0,
  }
}
