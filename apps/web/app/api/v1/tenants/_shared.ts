import { NextResponse, type NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { getServiceRoleClient } from "@/lib/supabase-admin"
import type { Database } from "@/types/supabase"

/**
 * Shared auth + tenant-ownership helpers for /api/v1/tenants/*.
 *
 *   requireSession(req)          → { userId, email } | NextResponse(401)
 *   requireOwnedTenant(req, id)  → { userId, tenant } | NextResponse(401|404|403)
 *
 * All endpoints use the service-role client for reads and writes — the
 * 2026-04-17 Better Auth migration dropped the RLS *_own policies, so
 * ownership is enforced here (in app code) instead.
 */

export type SupabaseAdmin = ReturnType<typeof getServiceRoleClient>

export interface AuthedUser {
  userId: string
  email: string
}

export async function requireSession(
  req: NextRequest | Request,
): Promise<AuthedUser | NextResponse> {
  const session = await auth.api.getSession({ headers: req.headers })
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "auth_required", message: "Missing, malformed, or expired session token." },
      { status: 401 },
    )
  }
  return { userId: session.user.id, email: session.user.email ?? "" }
}

export type OwnedTenantRow = Database["public"]["Tables"]["tenants"]["Row"]

export async function requireOwnedTenant(
  req: NextRequest | Request,
  tenantId: string,
): Promise<{ user: AuthedUser; tenant: OwnedTenantRow; admin: SupabaseAdmin } | NextResponse> {
  const userOrResp = await requireSession(req)
  if (userOrResp instanceof NextResponse) return userOrResp
  const admin = getServiceRoleClient()
  const { data: tenant, error } = await admin
    .from("tenants")
    .select("*")
    .eq("id", tenantId)
    .maybeSingle()
  if (error) {
    // Separate infra failures from a genuine miss so we can alert on the
    // former; otherwise a pooler/connectivity blip looks identical to
    // "tenant doesn't exist" and the 404 silently swallows the signal.
    console.error("[requireOwnedTenant] supabase error", { tenantId, error })
    return NextResponse.json({ error: "tenant_lookup_failed" }, { status: 503 })
  }
  if (!tenant) {
    return NextResponse.json({ error: "tenant_not_found" }, { status: 404 })
  }
  if (tenant.owner_id !== userOrResp.userId) {
    return NextResponse.json({ error: "not_tenant_owner" }, { status: 403 })
  }
  return { user: userOrResp, tenant, admin }
}

export function jsonError(status: number, code: string, message?: string) {
  return NextResponse.json({ error: code, ...(message ? { message } : {}) }, { status })
}
