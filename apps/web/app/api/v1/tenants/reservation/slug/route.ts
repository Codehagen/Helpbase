import { NextResponse, type NextRequest } from "next/server"
import { getServiceRoleClient } from "@/lib/supabase-admin"
import { jsonError, requireSession } from "../../_shared"

/**
 * PATCH /api/v1/tenants/reservation/slug
 *   auth: Bearer <Better Auth session token>
 *   body: { slug: string }
 *   returns (200): { id, slug, name, live_url, mcp_public_token }
 *   returns (400): invalid_body | slug_required | slug_invalid
 *   returns (404): no_reservation
 *   returns (409): slug_reserved | slug_taken
 *
 * Pre-deploy rename for the caller's active reservation. Post-deploy
 * renames are out of scope (would need a slug redirect layer the proxy
 * doesn't have yet) — the `.is("deployed_at", null)` filter is the gate.
 *
 * Slug validation rules MUST match POST /api/v1/tenants (the real-create
 * path): same regex, same length, same reserved list. A drift would mean
 * a user could `rename` into a shape that the subsequent `deploy --slug`
 * flow would reject. This file intentionally duplicates the two constants
 * until we have a single source-of-truth shared module (pre-existing
 * TODO in proxy.ts:8 — drift guard is a v1.5 CI check).
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ROOT_DOMAIN = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "helpbase.dev").trim()

// DNS-label shape, matches POST /api/v1/tenants and the CLI.
const SLUG_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/
const RESERVED = new Set([
  "www", "app", "api", "admin", "dashboard", "docs", "help", "blog", "status",
  "mail", "mcp", "deploy", "login", "signup", "signin", "auth", "billing",
  "support", "cdn", "static", "assets", "files", "media", "images", "img",
])

function liveUrlFor(slug: string): string {
  return `https://${slug}.${ROOT_DOMAIN}`
}

interface ReservationRow {
  id: string
  slug: string
  name: string
  mcp_public_token: string
  deployed_at: string | null
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const sessionOrResp = await requireSession(req)
  if (sessionOrResp instanceof NextResponse) return sessionOrResp
  const { userId } = sessionOrResp

  let body: { slug?: string }
  try {
    body = await req.json()
  } catch {
    return jsonError(400, "invalid_body", "Expected JSON {slug}.")
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

  // Fetch the caller's reservation first so we can distinguish "no
  // reservation" (404) from "tenant already deployed" (409 — the CLI
  // surfaces this as E_RESERVATION_LOCKED).
  const { data: current, error: lookupError } = await admin
    .from("tenants")
    .select("id, slug, name, mcp_public_token, deployed_at")
    .eq("owner_id", userId)
    .not("auto_provisioned_at", "is", null)
    .is("deployed_at", null)
    .maybeSingle<ReservationRow>()

  if (lookupError) {
    console.error("[tenants.reservation.slug] lookup error", { userId, lookupError })
    return jsonError(503, "internal_error", "Could not fetch reservation.")
  }
  if (!current) {
    return jsonError(404, "no_reservation")
  }
  // No-op rename: user sent the same slug they already have. Return 200
  // with the unchanged row so the CLI's rename command can idempotently
  // re-run (matches the auto-provision idempotency contract).
  if (current.slug === slug) {
    return NextResponse.json({
      id: current.id,
      slug: current.slug,
      name: current.name,
      live_url: liveUrlFor(current.slug),
      mcp_public_token: current.mcp_public_token,
    })
  }

  // Update the slug in place. The UNIQUE constraint on tenants.slug fires
  // if the new slug is taken; we catch 23505 and return 409.
  const { data: updated, error: updateError } = await admin
    .from("tenants")
    .update({ slug, name: slug })
    .eq("id", current.id)
    // Belt-and-suspenders: refuse to update if the row was deployed
    // between our lookup and this write. Shouldn't happen (deploys only
    // fire via the owner's own CLI, no race in practice), but the filter
    // costs nothing.
    .is("deployed_at", null)
    .select("id, slug, name, mcp_public_token")
    .maybeSingle<Pick<ReservationRow, "id" | "slug" | "name" | "mcp_public_token">>()

  if (updateError) {
    if ((updateError as { code?: string }).code === "23505") {
      return jsonError(409, "slug_taken", `"${slug}" is already taken.`)
    }
    console.error("[tenants.reservation.slug] update error", { userId, updateError })
    return jsonError(503, "internal_error", "Could not rename reservation.")
  }
  if (!updated) {
    // Row vanished between lookup and update — likely deploy raced.
    // Callers should re-query reservation state and surface appropriately.
    return jsonError(409, "reservation_locked", "Reservation was deployed before rename completed.")
  }

  return NextResponse.json({
    id: updated.id,
    slug: updated.slug,
    name: updated.name,
    live_url: liveUrlFor(updated.slug),
    mcp_public_token: updated.mcp_public_token,
  })
}
