import { NextResponse, type NextRequest } from "next/server"
import { getServiceRoleClient } from "@/lib/supabase-admin"
import { jsonError, requireSession } from "./_shared"

/**
 * POST /api/v1/tenants
 *   auth: Bearer <Better Auth session token>
 *   body: { slug: string, name?: string }
 *   returns: { id, slug, name, mcp_public_token }
 *
 * Creates a tenant owned by the caller. Enforces slug uniqueness via
 * the DB's UNIQUE constraint; 409 on duplicate.
 */

// DNS-label shape: alphanumeric start+end, hyphens only in the middle.
// Matches the CLI-side check in link.ts/deploy.ts so both paths agree.
const SLUG_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/
const RESERVED = new Set([
  "www", "app", "api", "admin", "dashboard", "docs", "help", "blog", "status",
  "mail", "mcp", "deploy", "login", "signup", "signin", "auth", "billing",
  "support", "cdn", "static", "assets", "files", "media", "images", "img",
])

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest): Promise<NextResponse> {
  const sessionOrResp = await requireSession(req)
  if (sessionOrResp instanceof NextResponse) return sessionOrResp

  let body: { slug?: string; name?: string }
  try {
    body = await req.json()
  } catch {
    return jsonError(400, "invalid_body", "Expected JSON {slug, name?}.")
  }

  const slug = body.slug?.trim()
  if (!slug) return jsonError(400, "slug_required")
  if (!SLUG_REGEX.test(slug)) {
    return jsonError(400, "slug_invalid", "Use lowercase letters, numbers, and hyphens.")
  }
  if (slug.length < 3 || slug.length > 40) {
    return jsonError(400, "slug_invalid", "Slug must be 3-40 characters.")
  }
  if (RESERVED.has(slug)) {
    return jsonError(409, "slug_reserved", `"${slug}" is reserved.`)
  }

  const admin = getServiceRoleClient()
  const { data, error } = await admin
    .from("tenants")
    .insert({
      slug,
      owner_id: sessionOrResp.userId,
      name: body.name?.trim() || slug,
    })
    .select("id, slug, name, mcp_public_token")
    .maybeSingle()

  if (error) {
    // Prefer Postgres error codes over regex on error.message — wording
    // is locale/driver-dependent. 23505 = unique_violation.
    if ((error as { code?: string }).code === "23505") {
      return jsonError(409, "slug_taken", `"${slug}" is already taken.`)
    }
    console.error("[tenants.create] supabase error", { slug, error })
    return jsonError(503, "internal_error", "Could not create tenant.")
  }
  if (!data) {
    return jsonError(503, "internal_error", "Tenant row not returned after insert.")
  }
  return NextResponse.json(data, { status: 201 })
}
