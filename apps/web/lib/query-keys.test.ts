import { describe, expect, it } from "vitest"
import { usageKeys, tenantKeys } from "./query-keys"

// Query keys are the cache's primary index. Renaming any of these
// silently breaks invalidation in every caller — so we snapshot them.
describe("query-keys", () => {
  describe("usageKeys", () => {
    it("all is ['usage']", () => {
      expect(usageKeys.all).toEqual(["usage"])
    })

    it("today is ['usage', 'today']", () => {
      expect(usageKeys.today()).toEqual(["usage", "today"])
    })

    it("today() is a prefix of all (for invalidation)", () => {
      const today = usageKeys.today()
      expect(today.slice(0, usageKeys.all.length)).toEqual(Array.from(usageKeys.all))
    })
  })

  describe("tenantKeys", () => {
    it("all is ['tenants']", () => {
      expect(tenantKeys.all).toEqual(["tenants"])
    })

    it("mine is ['tenants', 'mine']", () => {
      expect(tenantKeys.mine()).toEqual(["tenants", "mine"])
    })

    it("details is ['tenants', 'detail']", () => {
      expect(tenantKeys.details()).toEqual(["tenants", "detail"])
    })

    it("detail(id) includes id", () => {
      expect(tenantKeys.detail("abc-123")).toEqual(["tenants", "detail", "abc-123"])
    })

    it("detail(id) is under details()", () => {
      const detail = tenantKeys.detail("x")
      const details = tenantKeys.details()
      expect(detail.slice(0, details.length)).toEqual(Array.from(details))
    })

    it("different ids produce different keys", () => {
      expect(tenantKeys.detail("a")).not.toEqual(tenantKeys.detail("b"))
    })
  })
})
