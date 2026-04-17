import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import type { UsageTodayResponse } from "@workspace/shared/llm-wire"
import { getServiceRoleClient } from "@/lib/supabase-admin"
import { auth } from "@/lib/auth"
import {
  DAILY_USER_LIMIT,
  nextUtcMidnightIso,
  wireError,
} from "../../llm/_shared"

/**
 * GET /api/v1/usage/today
 *
 * Auth: Bearer <Better Auth session token>.
 * Returns the signed-in user's today-tokens snapshot, used by `helpbase whoami`.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: req.headers })
  if (!session?.user?.id) {
    return wireError(401, "auth_required", "Missing, malformed, or expired session token.")
  }

  const client = getServiceRoleClient()
  const { data, error } = await client.rpc("get_user_tokens_today", {
    p_user_id: session.user.id,
  })
  if (error) {
    return wireError(503, "internal_error", "Supabase is unavailable.")
  }

  const body: UsageTodayResponse = {
    email: session.user.email ?? "",
    quota: {
      usedToday: Number(data ?? 0),
      dailyLimit: DAILY_USER_LIMIT,
      resetAt: nextUtcMidnightIso(),
    },
  }
  return NextResponse.json(body)
}
