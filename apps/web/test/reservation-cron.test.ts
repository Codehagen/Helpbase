import { describe, it, expect } from "vitest"
import {
  RESERVATION_TTL_DAYS,
  filterDeletable,
  reservationCutoff,
} from "@/lib/reservation-cleanup"

/**
 * Unit tests for the cleanup-reservations cron predicate.
 *
 * The route handler is thin by design — Supabase does the heavy lifting,
 * and the middleware + auth gate are covered elsewhere. What's worth
 * testing in isolation is the 30-day cutoff math (easy to get wrong on
 * a date-refactor) and the defensive filter that excludes any tenant
 * with deploy history.
 *
 * Both functions are imported from `@/lib/reservation-cleanup` — the
 * SAME module the route handler imports. No shadow copies; test drift
 * can't silently pass against a stale duplicate. CodeRabbit flagged the
 * earlier shadow-copy pattern on PR #10.
 */

describe("cleanup-reservations TTL math", () => {
  it("TTL constant is 30 days (guard against an accidental refactor)", () => {
    expect(RESERVATION_TTL_DAYS).toBe(30)
  })

  it("cutoff is exactly 30 days before now (ISO)", () => {
    const now = new Date("2026-05-01T00:00:00.000Z")
    expect(reservationCutoff(now)).toBe("2026-04-01T00:00:00.000Z")
  })

  it("reservations younger than TTL are NOT candidates", () => {
    const now = new Date("2026-05-01T00:00:00.000Z")
    const cutoff = reservationCutoff(now)
    expect(now.toISOString() < cutoff).toBe(false)
    const ago29 = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString()
    expect(ago29 < cutoff).toBe(false)
  })

  it("reservations older than TTL ARE candidates", () => {
    const now = new Date("2026-05-01T00:00:00.000Z")
    const cutoff = reservationCutoff(now)
    const ago31 = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString()
    expect(ago31 < cutoff).toBe(true)
    const ago90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()
    expect(ago90 < cutoff).toBe(true)
  })
})

describe("cleanup-reservations shadow filter", () => {
  it("empty candidate list returns empty", () => {
    expect(filterDeletable([], [])).toEqual([])
  })

  it("candidates with no deploy history are all kept for deletion", () => {
    const candidates = [
      { id: "t-1", slug: "docs-aaa" },
      { id: "t-2", slug: "docs-bbb" },
    ]
    expect(filterDeletable(candidates, [])).toEqual(candidates)
  })

  it("candidates with deploy history are filtered out (safety net)", () => {
    const candidates = [
      { id: "t-1", slug: "docs-aaa" },
      { id: "t-2", slug: "docs-bbb" },
      { id: "t-3", slug: "docs-ccc" },
    ]
    const deployedShadows = [{ tenant_id: "t-2" }]
    const result = filterDeletable(candidates, deployedShadows)
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
    expect(filterDeletable(candidates, deployedShadows)).toEqual([])
  })
})
