import { NextResponse, type NextRequest } from "next/server"
import { getServiceRoleClient } from "@/lib/supabase-admin"

/**
 * POST /api/cron/cleanup-reservations
 *   auth: Authorization: Bearer $CRON_SECRET (Vercel Cron passes this automatically)
 *   query: ?dry=true — return candidate count + slugs without deleting
 *   returns: { deleted: number, slugs: string[] } on success
 *
 * Prunes abandoned reservations: rows that were auto-provisioned more than
 * 30 days ago, never deployed, and have no deploy history. The NOT EXISTS
 * guard against tenant_deploys is belt-and-suspenders — if deployed_at ever
 * failed to update for any reason, the deploys history still counts as
 * "this is a real tenant, don't delete". In practice the two conditions
 * should be equivalent.
 *
 * Scheduled via vercel.json cron entry (daily 03:00 UTC). Invoked by the
 * Vercel Cron runtime with Authorization: Bearer $CRON_SECRET. The secret
 * must be set in Vercel project env vars; a missing/mismatched secret
 * returns 401 (matches Vercel's guidance for hosted crons).
 *
 * Running it manually locally is supported for one-off cleanup:
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *     https://helpbase.dev/api/cron/cleanup-reservations?dry=true
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const RESERVATION_TTL_DAYS = 30

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET>. Unauthenticated
  // POSTs get 401 so the endpoint isn't a public /admin/prune button.
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error("[cron.cleanup-reservations] CRON_SECRET not configured")
    return NextResponse.json({ error: "cron_not_configured" }, { status: 500 })
  }
  const authHeader = req.headers.get("authorization") ?? ""
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const dryRun = req.nextUrl.searchParams.get("dry") === "true"

  const admin = getServiceRoleClient()

  // Find abandoned reservation candidates. Guards:
  //   - auto_provisioned_at IS NOT NULL  — it was provisioned via /auto-provision
  //   - deployed_at IS NULL              — never went live
  //   - auto_provisioned_at < NOW() - 30d — old enough to be considered stale
  // Then filter out anything that has tenant_deploys rows as a last-resort
  // safety net (if deployed_at somehow failed to update, the deploy row is
  // still the source of truth for "this tenant has published content").
  const cutoff = new Date(Date.now() - RESERVATION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data: candidates, error: selectError } = await admin
    .from("tenants")
    .select("id, slug")
    .not("auto_provisioned_at", "is", null)
    .is("deployed_at", null)
    .lt("auto_provisioned_at", cutoff)

  if (selectError) {
    console.error("[cron.cleanup-reservations] select error", { selectError })
    return NextResponse.json({ error: "select_failed" }, { status: 503 })
  }

  const candidateIds = (candidates ?? []).map((c) => c.id)
  if (candidateIds.length === 0) {
    return NextResponse.json({ deleted: 0, slugs: [], dry: dryRun })
  }

  // Belt-and-suspenders: check tenant_deploys. If any candidate has deploy
  // history, skip it — something's off, log + preserve.
  const { data: deployedShadows, error: shadowError } = await admin
    .from("tenant_deploys")
    .select("tenant_id")
    .in("tenant_id", candidateIds)

  if (shadowError) {
    console.error("[cron.cleanup-reservations] shadow lookup error", { shadowError })
    return NextResponse.json({ error: "shadow_check_failed" }, { status: 503 })
  }

  const shadowSet = new Set((deployedShadows ?? []).map((r) => r.tenant_id))
  const shadows = candidates!.filter((c) => shadowSet.has(c.id))
  if (shadows.length > 0) {
    console.warn(
      "[cron.cleanup-reservations] skipping tenants with deploy history despite deployed_at IS NULL",
      { count: shadows.length, slugs: shadows.map((s) => s.slug) },
    )
  }

  const toDelete = candidates!.filter((c) => !shadowSet.has(c.id))

  if (dryRun) {
    return NextResponse.json({
      deleted: 0,
      slugs: toDelete.map((c) => c.slug),
      dry: true,
      candidate_count: toDelete.length,
    })
  }

  if (toDelete.length === 0) {
    return NextResponse.json({ deleted: 0, slugs: [] })
  }

  const { error: deleteError } = await admin
    .from("tenants")
    .delete()
    .in(
      "id",
      toDelete.map((c) => c.id),
    )

  if (deleteError) {
    console.error("[cron.cleanup-reservations] delete error", { deleteError })
    return NextResponse.json({ error: "delete_failed" }, { status: 503 })
  }

  console.info("[cron.cleanup-reservations] deleted", {
    count: toDelete.length,
    slugs: toDelete.map((c) => c.slug),
  })

  return NextResponse.json({
    deleted: toDelete.length,
    slugs: toDelete.map((c) => c.slug),
  })
}
