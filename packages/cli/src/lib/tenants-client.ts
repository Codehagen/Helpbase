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
  const res = await fetch(v1Url("/mine"), {
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
  const res = await fetch(v1Url(`/${encodeURIComponent(tenantId)}`), {
    headers: { authorization: `Bearer ${session.accessToken}` },
  })
  if (res.status === 404 || res.status === 403) return null
  const body = await parseBody(res)
  if (!res.ok) throwHttp("get tenant", res, body)
  return body as TenantDetail
}

export async function checkSlugAvailability(slug: string): Promise<SlugAvailability> {
  const res = await fetch(v1Url(`/by-slug/${encodeURIComponent(slug)}`))
  const body = await parseBody(res)
  if (!res.ok) throwHttp("slug availability", res, body)
  return body as SlugAvailability
}

export async function createTenant(
  session: AuthSession,
  slug: string,
  name?: string,
): Promise<TenantCreated> {
  const res = await fetch(v1Url("/"), {
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
  const res = await fetch(v1Url(`/${encodeURIComponent(tenantId)}/deploy`), {
    method: "POST",
    headers: {
      authorization: `Bearer ${session.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  })
  const body = await parseBody(res)
  if (!res.ok) throwHttp("deploy tenant", res, body)
  return body as DeployResult
}

export async function deleteTenant(
  session: AuthSession,
  tenantId: string,
): Promise<{ slug: string }> {
  const res = await fetch(v1Url(`/${encodeURIComponent(tenantId)}`), {
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
  const res = await fetch(v1Url(`/${encodeURIComponent(tenantId)}/rotate-mcp-token`), {
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
