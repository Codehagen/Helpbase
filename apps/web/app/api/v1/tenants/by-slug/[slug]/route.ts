import { NextResponse, type NextRequest } from "next/server"
import { getServiceRoleClient } from "@/lib/supabase-admin"

/**
 * GET /api/v1/tenants/by-slug/:slug
 *   no auth — just an availability probe
 *   returns: { available: boolean, id?: string, slug?: string }
 *
 * Used by `helpbase link --slug foo` and `helpbase deploy` when picking
 * a subdomain. Only returns id + slug on hit — never owner_id or
 * mcp_public_token — so leaking this to anon is fine.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await ctx.params
  const admin = getServiceRoleClient()
  const { data } = await admin
    .from("tenants")
    .select("id, slug, active")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle()
  if (!data) return NextResponse.json({ available: true })
  return NextResponse.json({
    available: false,
    id: data.id,
    slug: data.slug,
  })
}
