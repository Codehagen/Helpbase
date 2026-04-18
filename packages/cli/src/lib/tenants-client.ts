/**
 * CLI-side HTTP client for /api/v1/tenants/*.
 *
 * Replaces the old `getAuthedSupabase(session)` path that authenticated
 * against Supabase directly. As of 2026-04-17 (Better Auth migration),
 * Better Auth session tokens are not Supabase JWTs — tenant CRUD now
 * goes through server-side API routes that enforce ownership with the
 * service role.
 *
 * All methods take an already-resolved `AuthSession` (callers get one
 * from `getCurrentSession()`) and send its accessToken as
 * `Authorization: Bearer <token>`.
 */

import type { AuthSession } from "./auth.js"
import { getAuthBaseUrl } from "./auth-client.js"

export interface TenantSummary {
  id: string
  slug: string
  name: string
}

export interface TenantDetail extends TenantSummary {
  mcp_public_token: string
  active: boolean
}

export interface TenantCreated extends TenantSummary {
  mcp_public_token: string
}

export interface DeployResult {
  deploy_id: string
  article_count: number
  chunk_count: number
  slug: string
}

export interface SlugAvailability {
  available: boolean
  id?: string
  slug?: string
}

function v1Url(path: string): string {
  return `${getAuthBaseUrl()}/api/v1/tenants${path.startsWith("/") ? path : `/${path}`}`
}

// Default per-request timeout. Short enough that a wedged TCP socket
// surfaces quickly, long enough to cover a cold Vercel function. Deploy
// can push a larger payload, so it gets a bumped timeout below.
const DEFAULT_TIMEOUT_MS = 30_000
const DEPLOY_TIMEOUT_MS = 120_000

async function v1Fetch(
  path: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  return fetch(v1Url(path), { ...init, signal: AbortSignal.timeout(timeoutMs) })
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => "")
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function throwHttp(op: string, res: Response, body: unknown): never {
  const msg =
    body && typeof body === "object" && "error" in body
      ? String((body as { error: unknown }).error)
      : typeof body === "string"
        ? body
        : `${res.status}`
  throw new Error(`${op} failed (${res.status}): ${msg}`)
}

export async function listMyTenants(session: AuthSession): Promise<TenantSummary[]> {
  const res = await v1Fetch("/mine", {
    headers: { authorization: `Bearer ${session.accessToken}` },
  })
  const body = await parseBody(res)
  if (!res.ok) throwHttp("list tenants", res, body)
  const obj = body as { tenants?: TenantSummary[] } | null
  return obj?.tenants ?? []
}

export async function getTenant(
  session: AuthSession,
  tenantId: string,
): Promise<TenantDetail | null> {
  const res = await v1Fetch(`/${encodeURIComponent(tenantId)}`, {
    headers: { authorization: `Bearer ${session.accessToken}` },
  })
  // 404 = tenant doesn't exist; callers treat this as "nothing to show".
  // 403 = the caller authenticated but isn't the owner — surface that
  // as a thrown error so callers can distinguish it from a missing row
  // (e.g. link.ts prints "you don't own this subdomain").
  if (res.status === 404) return null
  const body = await parseBody(res)
  if (!res.ok) throwHttp("get tenant", res, body)
  return body as TenantDetail
}

export async function checkSlugAvailability(slug: string): Promise<SlugAvailability> {
  const res = await v1Fetch(`/by-slug/${encodeURIComponent(slug)}`)
  const body = await parseBody(res)
  if (!res.ok) throwHttp("slug availability", res, body)
  return body as SlugAvailability
}

export async function createTenant(
  session: AuthSession,
  slug: string,
  name?: string,
): Promise<TenantCreated> {
  const res = await v1Fetch("/", {
    method: "POST",
    headers: {
      authorization: `Bearer ${session.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ slug, name }),
  })
  const body = await parseBody(res)
  if (!res.ok) throwHttp("create tenant", res, body)
  return body as TenantCreated
}

export interface DeployPayload {
  categories: unknown[]
  articles: unknown[]
  chunks: unknown[]
  validation_report?: Record<string, unknown>
}

export async function deployTenant(
  session: AuthSession,
  tenantId: string,
  payload: DeployPayload,
): Promise<DeployResult> {
  const res = await v1Fetch(
    `/${encodeURIComponent(tenantId)}/deploy`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    DEPLOY_TIMEOUT_MS,
  )
  const body = await parseBody(res)
  if (!res.ok) throwHttp("deploy tenant", res, body)
  return body as DeployResult
}

export async function deleteTenant(
  session: AuthSession,
  tenantId: string,
): Promise<{ slug: string }> {
  const res = await v1Fetch(`/${encodeURIComponent(tenantId)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${session.accessToken}` },
  })
  const body = await parseBody(res)
  if (!res.ok) throwHttp("delete tenant", res, body)
  return body as { slug: string }
}

export async function rotateMcpToken(
  session: AuthSession,
  tenantId: string,
): Promise<string> {
  const res = await v1Fetch(`/${encodeURIComponent(tenantId)}/rotate-mcp-token`, {
    method: "POST",
    headers: { authorization: `Bearer ${session.accessToken}` },
  })
  const body = await parseBody(res)
  if (!res.ok) throwHttp("rotate mcp token", res, body)
  const obj = body as { mcp_public_token?: string }
  if (!obj.mcp_public_token) {
    throw new Error("rotate mcp token: server did not return a token")
  }
  return obj.mcp_public_token
}

// ── Reservation flow (PR-B of CLI DX v2) ────────────────────────────────
//
// Login calls `autoProvisionTenant` to reserve a `docs-<6hex>.helpbase.dev`
// slug so the user sees a URL immediately. `getReservation` is the read-side
// used by `helpbase whoami` / `open` / lazy-provision fallbacks.
// `renameReservation` backs the `helpbase rename <slug>` command — pre-deploy
// slug change only.

export interface ReservationRow {
  id: string
  slug: string
  name: string
  live_url: string
  mcp_public_token: string
}

export interface ReservationCreated extends ReservationRow {
  /** True when this call minted a fresh row, false when it returned an existing reservation. */
  is_new: boolean
}

/**
 * Call POST /api/v1/tenants/auto-provision. Idempotent server-side —
 * repeat calls return the caller's existing reservation with `is_new: false`.
 * Login invokes this once after successful device flow; `whoami` / `deploy`
 * use it as a lazy-provision fallback for users who logged in before this
 * feature existed or who Ctrl-C'd between session save and the first
 * auto-provision call.
 */
export async function autoProvisionTenant(
  session: AuthSession,
): Promise<ReservationCreated> {
  const res = await v1Fetch("/auto-provision", {
    method: "POST",
    headers: { authorization: `Bearer ${session.accessToken}` },
  })
  const body = await parseBody(res)
  if (!res.ok) throwHttp("auto-provision tenant", res, body)
  return body as ReservationCreated
}

/**
 * Call GET /api/v1/tenants/reservation. Returns null on 404 so callers
 * can treat "no reservation" and "has reservation" as branching states
 * without catching an error object. Any other non-200 throws.
 */
export async function getReservation(
  session: AuthSession,
): Promise<ReservationRow | null> {
  const res = await v1Fetch("/reservation", {
    headers: { authorization: `Bearer ${session.accessToken}` },
  })
  if (res.status === 404) return null
  const body = await parseBody(res)
  if (!res.ok) throwHttp("get reservation", res, body)
  return body as ReservationRow
}

/**
 * Call PATCH /api/v1/tenants/reservation/slug. Server enforces the
 * pre-deploy gate (deployed_at IS NULL) and the slug validation rules.
 * Common failure codes the CLI handler translates to errors:
 *   - 404 `no_reservation`  → user has no reservation to rename
 *   - 409 `slug_taken`      → someone else owns the slug
 *   - 409 `slug_reserved`   → matches the RESERVED list
 *   - 409 `reservation_locked` → raced with a deploy that flipped deployed_at
 */
export async function renameReservation(
  session: AuthSession,
  slug: string,
): Promise<ReservationRow> {
  const res = await v1Fetch("/reservation/slug", {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${session.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ slug }),
  })
  const body = await parseBody(res)
  if (!res.ok) throwHttp("rename reservation", res, body)
  return body as ReservationRow
}
