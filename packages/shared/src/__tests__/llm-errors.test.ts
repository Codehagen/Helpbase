import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
  humanTokens,
  humanUntil,
  formatQuotaSuffix,
  AuthRequiredError,
  QuotaExceededError,
  GlobalCapError,
  GatewayError,
  LlmNetworkError,
} from "../llm-errors.js"

describe("humanTokens", () => {
  it("returns bare number under 1k", () => {
    expect(humanTokens(999)).toBe("999")
    expect(humanTokens(0)).toBe("0")
  })
  it("abbreviates thousands with decimal under 10k", () => {
    expect(humanTokens(1_500)).toBe("1.5k")
  })
  it("abbreviates thousands without decimal 10k+", () => {
    expect(humanTokens(47_250)).toBe("47k")
    expect(humanTokens(500_000)).toBe("500k")
  })
  it("abbreviates millions with 2 decimals", () => {
    expect(humanTokens(1_500_000)).toBe("1.50M")
  })
})

describe("humanUntil", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-17T10:00:00Z"))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("formats hours + minutes remaining", () => {
    expect(humanUntil("2026-04-17T14:23:00Z")).toBe("4h 23m")
  })
  it("formats only minutes when under an hour", () => {
    expect(humanUntil("2026-04-17T10:45:00Z")).toBe("45m")
  })
  it("returns 'now' for past timestamps", () => {
    expect(humanUntil("2026-04-17T09:00:00Z")).toBe("now")
  })
})

describe("formatQuotaSuffix", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-17T10:00:00Z"))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("includes human tokens, percent, reset", () => {
    const s = formatQuotaSuffix({
      usedToday: 47_250,
      dailyLimit: 500_000,
      resetAt: "2026-04-18T00:00:00Z",
    })
    expect(s).toMatch(/47k/)
    expect(s).toMatch(/9%/)
    expect(s).toMatch(/14h 0m/)
  })
})

describe("Error classes carry code + shape", () => {
  it("AuthRequiredError", () => {
    const e = new AuthRequiredError()
    expect(e.code).toBe("auth_required")
    expect(e.name).toBe("AuthRequiredError")
  })
  it("QuotaExceededError preserves fields", () => {
    const e = new QuotaExceededError({
      usedToday: 500_000,
      dailyLimit: 500_000,
      resetAt: "2026-04-18T00:00:00Z",
      upgradeUrl: "https://helpbase.dev/waitlist",
      byokDocsUrl: "https://helpbase.dev/docs/byok",
    })
    expect(e.code).toBe("quota_exceeded")
    expect(e.usedToday).toBe(500_000)
    expect(e.upgradeUrl).toBe("https://helpbase.dev/waitlist")
  })
  it("GlobalCapError", () => {
    const e = new GlobalCapError({
      resetAt: "2026-04-18T00:00:00Z",
      byokDocsUrl: "https://helpbase.dev/docs/byok",
    })
    expect(e.code).toBe("global_cap_hit")
  })
  it("GatewayError carries rawPreview", () => {
    const e = new GatewayError("upstream 500", "Server returned HTML")
    expect(e.code).toBe("gateway_error")
    expect(e.rawPreview).toBe("Server returned HTML")
  })
  it("LlmNetworkError", () => {
    const e = new LlmNetworkError()
    expect(e.code).toBe("llm_network_error")
  })
})
