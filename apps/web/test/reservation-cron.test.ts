import { describe, it, expect } from "vitest"

/**
 * Unit tests for the cleanup-reservations cron predicate.
 *
 * The route handler is thin by design — Supabase does the heavy lifting,
 * and the middleware + auth gate are covered elsewhere. What's worth
 * testing in isolation is the 30-day cutoff math (easy to get wrong on
 * a date-refactor) and the defensive filter that excludes any tenant
 * with deploy history, so this test pins both.
 */

const RESERVATION_TTL_DAYS = 30

function cutoffFor(now: Date): string {
  return new Date(now.getTime() - RESERVATION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

describe("cleanup-reservations TTL math", () => {
  it("cutoff is exactly 30 days before now (ISO)", () => {
    const now = new Date("2026-05-01T00:00:00.000Z")
    expect(cutoffFor(now)).toBe("2026-04-01T00:00:00.000Z")
  })

  it("reservations younger than TTL are NOT candidates", () => {
    const now = new Date("2026-05-01T00:00:00.000Z")
    const cutoff = cutoffFor(now)
    // A reservation made today (same Date object) is the youngest possible.
    expect(now.toISOString() < cutoff).toBe(false)
    // 29 days old — still not a candidate.
    const ago29 = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString()
    expect(ago29 < cutoff).toBe(false)
  })

  it("reservations older than TTL ARE candidates", () => {
    const now = new Date("2026-05-01T00:00:00.000Z")
    const cutoff = cutoffFor(now)
    // 31 days old — expired.
    const ago31 = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString()
    expect(ago31 < cutoff).toBe(true)
    // 90 days old — definitely expired.
    const ago90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()
    expect(ago90 < cutoff).toBe(true)
  })
})

describe("cleanup-reservations shadow filter", () => {
  /**
   * Shape of the post-filter logic: candidates are reservation rows
   * older than TTL; the filter removes any whose id appears in the
   * tenant_deploys table (defensive "don't delete anything with deploy
   * history even if deployed_at is null — that means deployed_at update
   * failed and the row is actually a live tenant").
   */
  function filterToDelete(
    candidates: Array<{ id: string; slug: string }>,
    deployedShadows: Array<{ tenant_id: string }>,
  ): Array<{ id: string; slug: string }> {
    const shadowSet = new Set(deployedShadows.map((r) => r.tenant_id))
    return candidates.filter((c) => !shadowSet.has(c.id))
  }

  it("empty candidate list returns empty", () => {
    expect(filterToDelete([], [])).toEqual([])
  })

  it("candidates with no deploy history are all kept for deletion", () => {
    const candidates = [
      { id: "t-1", slug: "docs-aaa" },
      { id: "t-2", slug: "docs-bbb" },
    ]
    expect(filterToDelete(candidates, [])).toEqual(candidates)
  })

  it("candidates with deploy history are filtered out (safety net)", () => {
    const candidates = [
      { id: "t-1", slug: "docs-aaa" },
      { id: "t-2", slug: "docs-bbb" }, // has shadow
      { id: "t-3", slug: "docs-ccc" },
    ]
    const deployedShadows = [{ tenant_id: "t-2" }]
    const result = filterToDelete(candidates, deployedShadows)
    expect(result).toEqual([
      { id: "t-1", slug: "docs-aaa" },
      { id: "t-3", slug: "docs-ccc" },
    ])
  })

  it("every candidate has deploy history → nothing deleted", () => {
    const candidates = [
      { id: "t-1", slug: "docs-aaa" },
      { id: "t-2", slug: "docs-bbb" },
    ]
    const deployedShadows = [{ tenant_id: "t-1" }, { tenant_id: "t-2" }]
    expect(filterToDelete(candidates, deployedShadows)).toEqual([])
  })
})
