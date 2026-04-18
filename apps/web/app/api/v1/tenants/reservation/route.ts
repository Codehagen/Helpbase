import { NextResponse, type NextRequest } from "next/server"
import { getServiceRoleClient } from "@/lib/supabase-admin"
import { jsonError, requireSession } from "../_shared"

/**
 * GET /api/v1/tenants/reservation
 *   auth: Bearer <Better Auth session token>
 *   returns (200): { id, slug, name, live_url, mcp_public_token }
 *   returns (404): { error: "no_reservation" }
 *
 * Read-side counterpart to POST /api/v1/tenants/auto-provision. The /mine
 * endpoint hides reservations so they don't pollute the tenant picker;
 * callers that need the reservation specifically (login re-hydration,
 * whoami's "reserved: ..." line, open's default URL fallback) hit this.
 *
 * Idempotent + cheap: single indexed lookup by the UNIQUE partial index
 * on owner_id WHERE auto_provisioned_at IS NOT NULL AND deployed_at IS NULL.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ROOT_DOMAIN = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "helpbase.dev").trim()

function liveUrlFor(slug: string): string {
  return `https://${slug}.${ROOT_DOMAIN}`
}

interface ReservationRow {
  id: string
  slug: string
  name: string
  mcp_public_token: string
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sessionOrResp = await requireSession(req)
  if (sessionOrResp instanceof NextResponse) return sessionOrResp

  const admin = getServiceRoleClient()
  const { data, error } = await admin
    .from("tenants")
    .select("id, slug, name, mcp_public_token")
    .eq("owner_id", sessionOrResp.userId)
    .not("auto_provisioned_at", "is", null)
    .is("deployed_at", null)
    .maybeSingle<ReservationRow>()

  if (error) {
    console.error("[tenants.reservation] lookup error", {
      userId: sessionOrResp.userId,
      error,
    })
    return jsonError(503, "internal_error", "Could not fetch reservation.")
  }

  if (!data) {
    return jsonError(404, "no_reservation")
  }

  return NextResponse.json({
    id: data.id,
    slug: data.slug,
    name: data.name,
    live_url: liveUrlFor(data.slug),
    mcp_public_token: data.mcp_public_token,
  })
}
