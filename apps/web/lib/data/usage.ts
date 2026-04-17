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

  return {
    email,
    quota: {
      usedToday: Number(data ?? 0),
      dailyLimit: DAILY_USER_LIMIT,
      resetAt: nextUtcMidnightIso(),
    },
  }
}
