import { NextResponse, type NextRequest } from "next/server"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { getServiceRoleClient } from "@/lib/supabase-admin"

/**
 * POST /api/revalidate
 *   body: { tenant_id: string }
 *   auth: Bearer <Better Auth session token> (from the CLI's authed session)
 *
 * Called by `helpbase deploy` after a successful RPC to flush the ISR cache
 * for the tenant's pages. Without this, pages served under
 * `{slug}.helpbase.dev/...` (ISR, 1h TTL) keep serving stale content for up
 * to an hour after the deploy — which breaks trust on the first deploy.
 *
 * Security: the caller's bearer must resolve to a Better Auth session whose
 * userId matches tenants.owner_id. Tenant lookup goes through the service-
 * role client because the 2026-04-17 migration dropped RLS owner-policies;
 * the owner match is enforced in application code. Mirrors the pattern in
 * /api/v1/llm/_shared.ts.
 */

export async function POST(req: NextRequest) {
  // Better Auth bearer → session. Rejects cookie-only or missing headers.
  const session = await auth.api.getSession({ headers: req.headers })
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "missing, malformed, or expired session token" },
      { status: 401 },
    )
  }

  // Parse body.
  let body: { tenant_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 })
  }
  const tenantId = body.tenant_id
  if (!tenantId || typeof tenantId !== "string") {
    return NextResponse.json({ error: "tenant_id is required" }, { status: 400 })
  }

  // Service-role lookup — RLS owner-policies were dropped in the Better Auth
  // migration, so ownership is enforced in code below.
  const admin = getServiceRoleClient()
  const { data: tenant, error } = await admin
    .from("tenants")
    .select("slug, owner_id")
    .eq("id", tenantId)
    .maybeSingle()

  if (error || !tenant) {
    return NextResponse.json({ error: "tenant not found" }, { status: 404 })
  }
  if (tenant.owner_id !== session.user.id) {
    return NextResponse.json({ error: "not tenant owner" }, { status: 403 })
  }

  // Flush the tenant's ISR cache. Layout-scoped revalidation covers both the
  // index and the catch-all article pages under /t/{slug}/....
  revalidatePath(`/t/${tenant.slug}`, "layout")

  return NextResponse.json({ revalidated: true, slug: tenant.slug })
}
