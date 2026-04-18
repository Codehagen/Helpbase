import { NextResponse, type NextRequest } from "next/server"
import { getServiceRoleClient } from "@/lib/supabase-admin"
import { requireSession } from "../_shared"

/**
 * GET /api/v1/tenants/mine
 *   auth: Bearer <Better Auth session token>
 *   returns: { tenants: Array<{ id, slug, name }> }
 *
 * Replaces the old CLI-side anon-Supabase query that filtered by
 * owner_id = auth.uid(). All current owner-lookups in deploy/link/open
 * route through here.
 *
 * Hides reservations: rows with deployed_at IS NULL are slug-reserved
 * but never published. They'd pollute the `helpbase deploy` tenant
 * picker and the `helpbase open` default-URL resolution. Callers that
 * WANT the reservation (login auto-provision, whoami) hit
 * GET /api/v1/tenants/reservation instead.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sessionOrResp = await requireSession(req)
  if (sessionOrResp instanceof NextResponse) return sessionOrResp

  const admin = getServiceRoleClient()
  const { data, error } = await admin
    .from("tenants")
    .select("id, slug, name")
    .eq("owner_id", sessionOrResp.userId)
    .eq("active", true)
    .not("deployed_at", "is", null)
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json(
      { error: "internal_error", message: "Could not list tenants." },
      { status: 503 },
    )
  }
  return NextResponse.json({ tenants: data ?? [] })
}
