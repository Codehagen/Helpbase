import type { UsageTodayResponse } from "@workspace/shared/llm-wire"
import { getServiceRoleClient } from "@/lib/supabase-admin"
import { DAILY_USER_LIMIT, nextUtcMidnightIso } from "@/app/api/v1/llm/_shared"

/**
 * Pure data function shared by the HTTP route (CLI consumers) and
 * server-component prefetching for /admin/usage.
 *
 * Throws on Supabase errors so the caller can shape the HTTP envelope
 * or the React error boundary separately.
 */
export async function getUsageTodayForUser(
  userId: string,
  email: string,
): Promise<UsageTodayResponse> {
  const client = getServiceRoleClient()
  const { data, error } = await client.rpc("get_user_tokens_today", {
    p_user_id: userId,
  })
  if (error) {
    throw new Error(`Supabase RPC get_user_tokens_today failed: ${error.message}`)
  }

  // Supabase returns bigint columns as strings to preserve precision.
  // Number() of a non-numeric string is NaN, which flows silently into
  // the UI as "NaN" and a broken progress bar. Clamp to 0 on parse fail
  // or negative values (quota-refund scenarios should never flip to red).
  const parsed = Number(data ?? 0)
  const usedToday = Number.isFinite(parsed) ? Math.max(0, parsed) : 0

  return {
    email,
    quota: {
      usedToday,
      dailyLimit: DAILY_USER_LIMIT,
      resetAt: nextUtcMidnightIso(),
    },
  }
}
