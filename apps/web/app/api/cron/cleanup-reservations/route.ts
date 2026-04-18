import { NextResponse, type NextRequest } from "next/server"
import { getServiceRoleClient } from "@/lib/supabase-admin"
import {
  RESERVATION_TTL_DAYS,
  filterDeletable,
  reservationCutoff,
} from "@/lib/reservation-cleanup"

/**
 * GET/POST /api/cron/cleanup-reservations
 *   auth: Authorization: Bearer $CRON_SECRET (Vercel Cron passes this automatically)
 *   query: ?dry=true — return candidate count + slugs without deleting
 *   returns: { deleted: number, slugs: string[] } on success
 *
 * Prunes abandoned reservations: rows that were auto-provisioned more than
 * 30 days ago, never deployed, and have no deploy history.
 *
 * Scheduled via vercel.json cron entry (daily 03:00 UTC). Vercel Cron
 * invokes paths as an HTTP GET with Authorization: Bearer $CRON_SECRET,
 * so GET is the primary export. POST is aliased so curl runbooks that
 * default to `-X POST` also work. A POST-only handler (earlier iteration
 * of this file) gets a 405 from Vercel Cron and the job silently never
 * runs — caught by /review codex on 2026-04-18.
 *
 * Running it manually locally:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     https://helpbase.dev/api/cron/cleanup-reservations?dry=true
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Hard cap on candidates per run. Protects the Node runtime from OOM on
// a runaway backlog and protects PostgREST from URL-length blowouts on
// the follow-up IN (id, ...) filters. If the real backlog grows past
// this, the cron catches up day-by-day (30-day TTL means anything truly
// abandoned sits longer than one run).
const MAX_CANDIDATES_PER_RUN = 500

// TTL constant + cutoff/filter helpers moved to lib/reservation-cleanup.ts
// so unit tests can exercise the exact same functions the route runs.
// Re-export so downstream consumers (docs, tests) keep the old import
// path working.
export { RESERVATION_TTL_DAYS }

export async function GET(req: NextRequest): Promise<NextResponse> {
  return handle(req)
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return handle(req)
}

async function handle(req: NextRequest): Promise<NextResponse> {
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET>. Unauthenticated
  // hits get 401 so the endpoint isn't a public /admin/prune button.
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error("[cron.cleanup-reservations] CRON_SECRET not configured")
    return NextResponse.json({ error: "cron_not_configured" }, { status: 500 })
  }
  const authHeader = req.headers.get("authorization") ?? ""
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  // Accept common truthy values for the dry-run flag so a stressed operator
  // typing `?dry=1` in a runbook doesn't accidentally delete.
  const dryParam = (req.nextUrl.searchParams.get("dry") ?? "").toLowerCase()
  const dryRun = dryParam === "true" || dryParam === "1" || dryParam === "yes"

  const admin = getServiceRoleClient()

  // Find abandoned reservation candidates. Guards on SELECT:
  //   - auto_provisioned_at IS NOT NULL  — provisioned via /auto-provision
  //   - deployed_at IS NULL              — never went live
  //   - auto_provisioned_at < NOW() - 30d — old enough to be considered stale
  // `.limit(MAX_CANDIDATES_PER_RUN)` caps memory + URL-length risk on the
  // follow-up .in() filters. Day-over-day runs drain the backlog.
  const cutoff = reservationCutoff(new Date())

  const { data: candidates, error: selectError } = await admin
    .from("tenants")
    .select("id, slug")
    .not("auto_provisioned_at", "is", null)
    .is("deployed_at", null)
    .lt("auto_provisioned_at", cutoff)
    .limit(MAX_CANDIDATES_PER_RUN)

  if (selectError) {
    console.error("[cron.cleanup-reservations] select error", { selectError })
    return NextResponse.json({ error: "select_failed" }, { status: 503 })
  }

  const candidateIds = (candidates ?? []).map((c) => c.id)
  if (candidateIds.length === 0) {
    return NextResponse.json({ deleted: 0, slugs: [], dry: dryRun })
  }

  // Belt-and-suspenders: if any candidate has tenant_deploys rows despite
  // deployed_at being null, something's off (deployed_at update failed,
  // data-repair script ran, etc.) — preserve them and log for audit.
  const { data: deployedShadows, error: shadowError } = await admin
    .from("tenant_deploys")
    .select("tenant_id")
    .in("tenant_id", candidateIds)

  if (shadowError) {
    console.error("[cron.cleanup-reservations] shadow lookup error", { shadowError })
    return NextResponse.json({ error: "shadow_check_failed" }, { status: 503 })
  }

  const shadowList = deployedShadows ?? []
  const toDelete = filterDeletable(candidates!, shadowList)
  const shadows = candidates!.length - toDelete.length
  if (shadows > 0) {
    const shadowIds = new Set(shadowList.map((r) => r.tenant_id))
    const shadowSlugs = candidates!
      .filter((c) => shadowIds.has(c.id))
      .map((c) => c.slug)
    console.warn(
      "[cron.cleanup-reservations] skipping tenants with deploy history despite deployed_at IS NULL",
      { count: shadows, slugs: shadowSlugs },
    )
  }

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

  // Race-safe delete: the WHERE clause repeats every predicate so a
  // tenant that deployed AFTER the candidate select but BEFORE this
  // DELETE is NOT dropped by this statement — PostgreSQL evaluates the
  // filters at DELETE time, not at the earlier SELECT. Without these
  // extra filters, the cron could race a concurrent first deploy and
  // destroy a tenant that just went live. Codex caught this in the PR
  // #10 /review pass 2026-04-18.
  const { data: deleted, error: deleteError } = await admin
    .from("tenants")
    .delete()
    .in(
      "id",
      toDelete.map((c) => c.id),
    )
    .not("auto_provisioned_at", "is", null)
    .is("deployed_at", null)
    .lt("auto_provisioned_at", cutoff)
    .select("id, slug")

  if (deleteError) {
    console.error("[cron.cleanup-reservations] delete error", { deleteError })
    return NextResponse.json({ error: "delete_failed" }, { status: 503 })
  }

  const actuallyDeleted = deleted ?? []
  const raced = toDelete.length - actuallyDeleted.length
  if (raced > 0) {
    console.info(
      "[cron.cleanup-reservations] skipped tenants that raced a deploy between select and delete",
      { raced },
    )
  }

  console.info("[cron.cleanup-reservations] deleted", {
    count: actuallyDeleted.length,
    slugs: actuallyDeleted.map((c) => c.slug),
  })

  return NextResponse.json({
    deleted: actuallyDeleted.length,
    slugs: actuallyDeleted.map((c) => c.slug),
    raced,
  })
}
