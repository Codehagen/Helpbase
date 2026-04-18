import { NextResponse, type NextRequest } from "next/server"
import { randomBytes } from "node:crypto"
import { getServiceRoleClient } from "@/lib/supabase-admin"
import { jsonError, requireSession } from "../_shared"

/**
 * POST /api/v1/tenants/auto-provision
 *   auth: Bearer <Better Auth session token>
 *   body: (none)
 *   returns: { id, slug, name, live_url, mcp_public_token, is_new }
 *
 * Reserves a `docs-<6hex>` subdomain for the caller at login time. Idempotent:
 * a second call from the same user (or a retry after a flaky network) returns
 * the existing reservation with `is_new: false` — the UNIQUE partial index
 * `idx_tenants_owner_one_reservation` guarantees a concurrent race can't
 * create two reservations.
 *
 * Product rationale (from /plan-devex-review 2026-04-18): users deploy PRODUCT
 * docs, not personal ones, so the default slug is deliberately product-neutral
 * (`docs-<6hex>`) rather than email-derived. Users rename via
 * `helpbase rename <new>` (pre-deploy only) or abandon the reservation and
 * pick a real slug on their first deploy. Abandoned reservations clean up
 * after 30 days via /api/cron/cleanup-reservations.
 *
 * Collision strategy: the slug uses 24 bits of entropy (6 hex chars ≈ 16M
 * values), so a first-try collision is vanishingly rare even at launch-day
 * signup volume. If 23505 hits on the slug UNIQUE we retry once with a
 * fresh suffix; a second collision returns 503 (signals either an under-
 * provisioned PRNG or something pathological).
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ROOT_DOMAIN = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "helpbase.dev").trim()

/**
 * Generate a new reservation slug. `docs-` prefix is product-neutral and
 * signals "placeholder" at a glance. 6 hex chars = 16M possibilities;
 * collision probability on a fresh insert is effectively zero.
 */
function generateReservationSlug(): string {
  return `docs-${randomBytes(3).toString("hex")}`
}

/**
 * Build the live URL for a tenant. The subdomain middleware in proxy.ts
 * reads this same ROOT_DOMAIN env var; keep both in sync.
 */
function liveUrlFor(slug: string): string {
  return `https://${slug}.${ROOT_DOMAIN}`
}

interface ReservationRow {
  id: string
  slug: string
  name: string
  mcp_public_token: string
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const sessionOrResp = await requireSession(req)
  if (sessionOrResp instanceof NextResponse) return sessionOrResp
  const { userId } = sessionOrResp

  const admin = getServiceRoleClient()

  // 1. Idempotency check: does the caller already have an active reservation?
  //    The UNIQUE partial index enforces at most one, so .maybeSingle() is
  //    the right shape. If they have a DEPLOYED tenant but no reservation,
  //    that's not our concern — login calls this; the reservation is only
  //    the pre-first-deploy placeholder.
  const { data: existing, error: lookupError } = await admin
    .from("tenants")
    .select("id, slug, name, mcp_public_token")
    .eq("owner_id", userId)
    .not("auto_provisioned_at", "is", null)
    .is("deployed_at", null)
    .maybeSingle<ReservationRow>()

  if (lookupError) {
    console.error("[tenants.auto-provision] lookup error", { userId, lookupError })
    return jsonError(503, "internal_error", "Could not check for existing reservation.")
  }

  if (existing) {
    return NextResponse.json({
      id: existing.id,
      slug: existing.slug,
      name: existing.name,
      live_url: liveUrlFor(existing.slug),
      mcp_public_token: existing.mcp_public_token,
      is_new: false,
    })
  }

  // 2. Insert a fresh reservation. Retry once on slug collision; the
  //    UNIQUE partial index on owner_id catches a concurrent second
  //    auto-provision call and we re-read the existing row in that case.
  for (let attempt = 0; attempt < 2; attempt++) {
    const slug = generateReservationSlug()
    const { data: created, error: insertError } = await admin
      .from("tenants")
      .insert({
        slug,
        owner_id: userId,
        name: slug,
        auto_provisioned_at: new Date().toISOString(),
        // deployed_at stays null; deploy_tenant RPC flips it on first publish.
      })
      .select("id, slug, name, mcp_public_token")
      .maybeSingle<ReservationRow>()

    if (!insertError && created) {
      return NextResponse.json(
        {
          id: created.id,
          slug: created.slug,
          name: created.name,
          live_url: liveUrlFor(created.slug),
          mcp_public_token: created.mcp_public_token,
          is_new: true,
        },
        { status: 201 },
      )
    }

    // Postgres 23505 = unique_violation. Two constraints can fire on this
    // INSERT: the slug UNIQUE (collision on the random docs-<6hex>) and the
    // owner-reservation UNIQUE partial index (concurrent login won the race).
    //
    // We used to discriminate via substring-match on `details`/`message`
    // looking for the partial-index name, but that's fragile to driver
    // version and Postgres error-message format changes. Safer: re-read
    // the caller's reservation unconditionally. If one exists, a concurrent
    // call won — return it as the idempotent path (is_new: false). If
    // nothing exists, the collision was on the slug — retry with a fresh
    // suffix. Worst case: two round-trips per collision instead of one;
    // collisions are vanishingly rare anyway (24 bits of entropy).
    const code = (insertError as { code?: string } | null)?.code
    if (code === "23505") {
      const { data: raced } = await admin
        .from("tenants")
        .select("id, slug, name, mcp_public_token")
        .eq("owner_id", userId)
        .not("auto_provisioned_at", "is", null)
        .is("deployed_at", null)
        .maybeSingle<ReservationRow>()
      if (raced) {
        return NextResponse.json({
          id: raced.id,
          slug: raced.slug,
          name: raced.name,
          live_url: liveUrlFor(raced.slug),
          mcp_public_token: raced.mcp_public_token,
          is_new: false,
        })
      }
      // No reservation found → the 23505 was the slug UNIQUE. Retry with
      // a fresh suffix on the next loop iteration.
      continue
    }

    console.error("[tenants.auto-provision] insert error", { userId, insertError })
    return jsonError(503, "internal_error", "Could not create reservation.")
  }

  // Exhausted retries. Two consecutive slug collisions with 24 bits of entropy
  // is astronomical; log loudly so we notice if the PRNG is degraded.
  console.error("[tenants.auto-provision] exhausted slug-collision retries", { userId })
  return jsonError(
    503,
    "slug_exhausted",
    "Could not mint a unique reservation slug after 2 attempts — retry shortly.",
  )
}
