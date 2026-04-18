import fs from "node:fs"
import path from "node:path"
import os from "node:os"

/**
 * Local cache for the user's slug reservation.
 *
 * The server (POST /api/v1/tenants/auto-provision) is the source of
 * truth; this file exists so `helpbase whoami` / `open` / `deploy`
 * don't have to hit the network every time to show or consume the
 * reserved URL. On cache miss (no file, corrupt JSON, or stale tenant
 * id) callers fall back to `getReservation()` against the server and
 * overwrite the cache with the fresh row.
 *
 * Intentionally a SEPARATE file from `~/.helpbase/auth.json`. Reasons:
 *   - `storeSession` writes a fixed StoredAuth shape; extending it to
 *     also carry a reservation would mean every session write has to
 *     preserve the reservation, creating a subtle "lost on re-auth"
 *     footgun.
 *   - Two concerns, two files: the session is a credential; the
 *     reservation is just cached state. `logout` clears auth.json but
 *     leaves reservation.json alone (the reservation survives on the
 *     server across logins).
 *
 * File location: `~/.helpbase/reservation.json`, mode 0o600 to match
 * auth.json. The 0o700 parent-dir mode is created by storeSession on
 * first login; we reuse it if it exists and fall through if not.
 */

const HOME = os.homedir()
// Mirrors the AUTH_DIR constant in auth.ts — keep in lockstep.
const BASE_DIR = process.env.HELPBASE_CONFIG_DIR ?? path.join(HOME, ".helpbase")
const FILE = path.join(BASE_DIR, "reservation.json")

export interface CachedReservation {
  /** The reserved tenant's UUID — used as the idempotency key for deploy. */
  tenantId: string
  slug: string
  /** e.g. `https://docs-a3f9c1.helpbase.dev`. Precomputed by the server. */
  liveUrl: string
  /** Raw MCP bearer — mirrored here so `helpbase whoami` can surface it without a second roundtrip. */
  mcpPublicToken: string
  /** The user this reservation belongs to. If the CLI logs in as a different user, the cache is stale. */
  userId: string
  /** ISO timestamp of when this cache entry was written. Purely informational. */
  cachedAt: string
}

/**
 * Read the cached reservation, or return null if the file is missing,
 * unreadable, or shaped wrong. Callers treat null as "no cache — hit
 * the server."
 */
export function readCachedReservation(): CachedReservation | null {
  if (!fs.existsSync(FILE)) return null
  try {
    const raw = fs.readFileSync(FILE, "utf-8")
    const parsed = JSON.parse(raw) as Partial<CachedReservation>
    if (
      typeof parsed.tenantId !== "string" ||
      typeof parsed.slug !== "string" ||
      typeof parsed.liveUrl !== "string" ||
      typeof parsed.mcpPublicToken !== "string" ||
      typeof parsed.userId !== "string"
    ) {
      return null
    }
    return {
      tenantId: parsed.tenantId,
      slug: parsed.slug,
      liveUrl: parsed.liveUrl,
      mcpPublicToken: parsed.mcpPublicToken,
      userId: parsed.userId,
      cachedAt: parsed.cachedAt ?? "",
    }
  } catch {
    return null
  }
}

/**
 * Write the reservation to disk. Creates `~/.helpbase/` if it doesn't
 * exist with 0o700, and force-narrows the file to 0o600 on every write
 * (matches auth.ts — writeFileSync's mode is only honored on create, so
 * a pre-existing loose-perms file needs an explicit chmod).
 */
export function writeCachedReservation(reservation: Omit<CachedReservation, "cachedAt">): void {
  if (!fs.existsSync(BASE_DIR)) {
    fs.mkdirSync(BASE_DIR, { recursive: true, mode: 0o700 })
  }
  const payload: CachedReservation = {
    ...reservation,
    cachedAt: new Date().toISOString(),
  }
  fs.writeFileSync(FILE, JSON.stringify(payload, null, 2), { mode: 0o600 })
  try {
    fs.chmodSync(FILE, 0o600)
  } catch {
    // best-effort — FAT/SMB don't support chmod
  }
}

/**
 * Remove the cache file. Called by `deploy` after first-deploy succeeds
 * (the reservation is no longer a reservation — it's a live tenant, and
 * `.helpbase/project.json` is now the canonical local pointer) and by
 * `rename` before re-fetching so a stale slug can't leak into the next
 * whoami render.
 */
export function clearCachedReservation(): boolean {
  if (!fs.existsSync(FILE)) return false
  try {
    fs.unlinkSync(FILE)
    return true
  } catch {
    return false
  }
}

export function getCachedReservationPath(): string {
  return FILE
}
