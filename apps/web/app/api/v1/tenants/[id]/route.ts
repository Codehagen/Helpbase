import { NextResponse, type NextRequest } from "next/server"
import { jsonError, requireOwnedTenant } from "../_shared"

/**
 * GET /api/v1/tenants/:id
 *   auth: Bearer <Better Auth session token>
 *   returns: full tenant row, or 403 if the caller is not the owner
 *
 * Used by `helpbase deploy` when it has a linked tenantId from
 * .helpbase/project.json and wants to confirm the row still exists
 * and belongs to the caller before deploying.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params
  const owned = await requireOwnedTenant(req, id)
  if (owned instanceof NextResponse) return owned
  // Never expose owner_id of other users (the gate above already guarantees
  // it's the caller's own tenant, but mcp_public_token is sensitive — return
  // only what the CLI needs).
  const { id: tid, slug, name, mcp_public_token, active } = owned.tenant
  return NextResponse.json({ id: tid, slug, name, mcp_public_token, active })
}

/**
 * DELETE /api/v1/tenants/:id
 *   auth: Bearer <Better Auth session token>
 *   returns: { deleted: true, slug }
 *
 * Hard delete — cascades to tenant_articles, tenant_categories, tenant_chunks,
 * tenant_deploys, tenant_mcp_queries via their owner FKs. Caller must
 * re-confirm in the CLI before hitting this endpoint.
 */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params
  const owned = await requireOwnedTenant(req, id)
  if (owned instanceof NextResponse) return owned
  const { tenant, admin } = owned
  const { error } = await admin.from("tenants").delete().eq("id", tenant.id)
  if (error) {
    console.error("[tenants.delete] supabase error", { tenantId: tenant.id, error })
    return jsonError(503, "delete_failed", "Could not delete tenant.")
  }
  return NextResponse.json({ deleted: true, slug: tenant.slug })
}
