import pc from "picocolors"
import type { AuthSession } from "./auth.js"
import {
  autoProvisionTenant,
  getReservation,
  type ReservationCreated,
  type ReservationRow,
} from "./tenants-client.js"
import {
  readCachedReservation,
  writeCachedReservation,
  type CachedReservation,
} from "./reservation-cache.js"

/**
 * Reservation resolution helpers.
 *
 * Two shapes the CLI needs on a regular basis:
 *
 *   - `ensureReservation(session)` — called by `login`, `whoami`, and
 *     `deploy` when the user is authed but has no deployed tenants +
 *     no cached reservation. Calls POST /auto-provision (idempotent
 *     on the server) and writes the result to the local cache. If the
 *     server is unreachable or 503s, returns null so the caller can
 *     print a soft warning without failing the surrounding flow.
 *
 *   - `loadReservation(session)` — read-only path for commands like
 *     `whoami` / `open`. Checks the cache first; falls back to
 *     GET /reservation on miss; refreshes the cache on hit. Returns
 *     null when the user has no active reservation.
 *
 * The cache can go stale (the user might `rename` from a different
 * shell, for example). Cache-first callers that tolerate staleness
 * use `loadReservation`; auth-critical paths (first-login bootstrap)
 * bypass the cache and call autoProvisionTenant directly.
 */

/** Returned by `ensureReservation` so callers can differentiate fresh vs existing. */
export interface EnsuredReservation {
  tenantId: string
  slug: string
  liveUrl: string
  mcpPublicToken: string
  isNew: boolean
}

export async function ensureReservation(
  session: AuthSession,
): Promise<EnsuredReservation | null> {
  try {
    const provisioned = await autoProvisionTenant(session)
    cacheFromServer(session, provisioned)
    return toEnsured(provisioned)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Best-effort: login flows swallow this; the caller prints a soft
    // warning. We surface a structured diagnostic to stderr so the user
    // can still see what went wrong without the error aborting login.
    process.stderr.write(
      `${pc.yellow("!")} ${pc.dim("Could not reserve a subdomain right now:")} ${msg}\n` +
        `  ${pc.dim("Login succeeded. Run")} ${pc.cyan("helpbase whoami")} ${pc.dim("later to retry.")}\n`,
    )
    return null
  }
}

/**
 * Cache-first reservation lookup. Returns whatever we know about the
 * user's reservation (from the local file, then from the server on miss)
 * or null if they have no active reservation.
 *
 * Callers can pass `forceRefresh: true` to skip the cache — useful for
 * `helpbase rename` / `helpbase whoami --refresh` where the user explicitly
 * wants a round-trip.
 */
export async function loadReservation(
  session: AuthSession,
  opts: { forceRefresh?: boolean } = {},
): Promise<CachedReservation | null> {
  if (!opts.forceRefresh) {
    const cached = readCachedReservation()
    if (cached && cached.userId === session.userId) {
      return cached
    }
  }
  let remote: ReservationRow | null = null
  try {
    remote = await getReservation(session)
  } catch {
    // Network / 503 — fall back to whatever's cached (best-effort read).
    return readCachedReservation()
  }
  if (!remote) return null
  cacheFromServer(session, remote)
  return readCachedReservation()
}

function cacheFromServer(
  session: AuthSession,
  row: ReservationCreated | ReservationRow,
): void {
  writeCachedReservation({
    tenantId: row.id,
    slug: row.slug,
    liveUrl: row.live_url,
    mcpPublicToken: row.mcp_public_token,
    userId: session.userId,
  })
}

function toEnsured(row: ReservationCreated): EnsuredReservation {
  return {
    tenantId: row.id,
    slug: row.slug,
    liveUrl: row.live_url,
    mcpPublicToken: row.mcp_public_token,
    isNew: row.is_new,
  }
}
