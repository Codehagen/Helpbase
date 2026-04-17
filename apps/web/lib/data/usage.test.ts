import { describe, expect, it, vi } from "vitest"
import { getUsageTodayForUser } from "./usage"

vi.mock("@/lib/supabase-admin", () => ({
  getServiceRoleClient: vi.fn(),
}))

import { getServiceRoleClient } from "@/lib/supabase-admin"

describe("getUsageTodayForUser", () => {
  it("returns a UsageTodayResponse with usedToday + dailyLimit", async () => {
    vi.mocked(getServiceRoleClient).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: 42_000, error: null }),
    } as unknown as ReturnType<typeof getServiceRoleClient>)

    const out = await getUsageTodayForUser("user-1", "u@example.com")

    expect(out.email).toBe("u@example.com")
    expect(out.quota.usedToday).toBe(42_000)
    expect(out.quota.dailyLimit).toBe(500_000)
    expect(typeof out.quota.resetAt).toBe("string")
  })

  it("coerces null RPC result to 0", async () => {
    vi.mocked(getServiceRoleClient).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as unknown as ReturnType<typeof getServiceRoleClient>)

    const out = await getUsageTodayForUser("user-1", "")
    expect(out.quota.usedToday).toBe(0)
  })

  it("throws when the RPC returns an error", async () => {
    vi.mocked(getServiceRoleClient).mockReturnValue({
      rpc: vi
        .fn()
        .mockResolvedValue({ data: null, error: { message: "db offline" } }),
    } as unknown as ReturnType<typeof getServiceRoleClient>)

    await expect(getUsageTodayForUser("user-1", "")).rejects.toThrow(/db offline/)
  })
})
