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

// Must match the creation-side shape — otherwise we waste a DB round-trip
// on values that can never be tenant slugs, and leave room for enumeration
// via oversized inputs.
const SLUG_REGEX = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await ctx.params
  if (!SLUG_REGEX.test(slug)) {
    return NextResponse.json({ available: false }, { status: 400 })
  }
  const admin = getServiceRoleClient()
  // Don't filter by active=true — the DB's UNIQUE(slug) index ignores it,
  // so an inactive tenant still blocks creation. Reporting "available"
  // here would produce a confusing 409 downstream.
  const { data } = await admin
    .from("tenants")
    .select("id, slug")
    .eq("slug", slug)
    .maybeSingle()
  if (!data) return NextResponse.json({ available: true })
  return NextResponse.json({
    available: false,
    id: data.id,
    slug: data.slug,
  })
}
