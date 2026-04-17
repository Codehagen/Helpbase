import { NextResponse, type NextRequest } from "next/server"
import { jsonError, requireOwnedTenant } from "../../_shared"

/**
 * POST /api/v1/tenants/:id/rotate-mcp-token
 *   auth: Bearer <Better Auth session token>
 *   returns: { mcp_public_token }
 *
 * Rotates the tenant's MCP bearer. Generates a 32-byte hex token
 * server-side. The old token is immediately invalidated — any existing
 * MCP clients using the old token will 401.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params
  const owned = await requireOwnedTenant(req, id)
  if (owned instanceof NextResponse) return owned
  const { tenant, admin } = owned

  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const newToken = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")

  const { data: updated, error } = await admin
    .from("tenants")
    .update({ mcp_public_token: newToken })
    .eq("id", tenant.id)
    .select("id")
    .maybeSingle()
  if (error) {
    console.error("[tenants.rotate-mcp-token] supabase error", { tenantId: tenant.id, error })
    return jsonError(503, "rotate_failed", "Could not rotate token.")
  }
  // If the row disappeared between requireOwnedTenant and the update (race
  // with DELETE, or soft-delete turning active=false), don't return a token
  // that's stored nowhere — the MCP client would 401 forever.
  if (!updated) {
    return jsonError(404, "tenant_not_found", "Tenant disappeared before rotation completed.")
  }
  return NextResponse.json({ mcp_public_token: newToken })
}
