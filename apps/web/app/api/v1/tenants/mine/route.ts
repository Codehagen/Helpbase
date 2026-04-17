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
    .order("created_at", { ascending: false })

  if (error) {
    return NextResponse.json(
      { error: "internal_error", message: "Could not list tenants." },
      { status: 503 },
    )
  }
  return NextResponse.json({ tenants: data ?? [] })
}
