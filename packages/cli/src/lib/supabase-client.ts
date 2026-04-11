import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"

// Public Supabase credentials (safe to embed in CLI)
const SUPABASE_URL = "https://yamxvyexqxpdrnoymwhv.supabase.co"
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlhbXh2eWV4cXhwZHJub3ltd2h2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NTI5MjUsImV4cCI6MjA5MTQyODkyNX0.CIV8-oRqCCfTrAIyq0iTLYpEnJHkUkqQ4VU3ImwLUFo"

const AUTH_DIR = path.join(os.homedir(), ".helpbase")
const AUTH_FILE = path.join(AUTH_DIR, "auth.json")

interface StoredAuth {
  access_token: string
  refresh_token: string
  expires_at: number
  user_id: string
  email: string
}

/**
 * Create an anonymous Supabase client (for pre-auth operations like slug checks).
 */
export function createAnonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
}

/**
 * Create an authenticated Supabase client from cached credentials.
 * Returns null if not authenticated.
 */
export async function createAuthClient(): Promise<SupabaseClient | null> {
  const auth = loadStoredAuth()
  if (!auth) return null

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

  const { error } = await client.auth.setSession({
    access_token: auth.access_token,
    refresh_token: auth.refresh_token,
  })

  if (error) {
    clearStoredAuth()
    return null
  }

  return client
}

/**
 * Get the stored user email, or null if not authenticated.
 */
export function getStoredEmail(): string | null {
  const auth = loadStoredAuth()
  return auth?.email ?? null
}

/**
 * Store auth credentials after successful login.
 */
export function storeAuth(session: {
  access_token: string
  refresh_token: string
  expires_at?: number
  user: { id: string; email?: string }
}): void {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true })
  }

  const data: StoredAuth = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at ?? Date.now() / 1000 + 3600,
    user_id: session.user.id,
    email: session.user.email ?? "",
  }

  fs.writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2), { mode: 0o600 })
}

/**
 * Clear stored auth (logout).
 */
export function clearStoredAuth(): void {
  if (fs.existsSync(AUTH_FILE)) {
    fs.unlinkSync(AUTH_FILE)
  }
}

function loadStoredAuth(): StoredAuth | null {
  if (!fs.existsSync(AUTH_FILE)) return null

  try {
    const raw = fs.readFileSync(AUTH_FILE, "utf-8")
    return JSON.parse(raw) as StoredAuth
  } catch {
    return null
  }
}
