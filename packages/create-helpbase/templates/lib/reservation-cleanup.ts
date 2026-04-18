/**
 * Pure helpers for the cleanup-reservations cron. Extracted so unit tests
 * exercise the same predicate the route handler runs, not a shadow copy.
 * CodeRabbit flagged the duplication on PR #10.
 *
 * The route still performs the actual SELECT + DELETE against Supabase
 * (that part is not unit-testable without a live DB); what we pin here
 * is the 30-day TTL math and the shadow-safety filter.
 */

export const RESERVATION_TTL_DAYS = 30

/** ISO timestamp of the cutoff: anything auto_provisioned before this is TTL-expired. */
export function reservationCutoff(now: Date): string {
  return new Date(now.getTime() - RESERVATION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

export interface Candidate {
  id: string
  slug: string
}

/**
 * Given candidate reservation rows (TTL-expired) and the set of tenant_ids
 * that have deploy history, returns only the rows that are safe to delete.
 * Belt-and-suspenders: any candidate with a tenant_deploys row is preserved
 * even if `deployed_at` is null (data-repair state, failed RPC, etc.).
 */
export function filterDeletable(
  candidates: Candidate[],
  deployedShadows: Array<{ tenant_id: string }>,
): Candidate[] {
  const shadowSet = new Set(deployedShadows.map((r) => r.tenant_id))
  return candidates.filter((c) => !shadowSet.has(c.id))
}
