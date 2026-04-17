import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import type { UsageTodayResponse } from "@workspace/shared/llm-wire"
import { getServiceRoleClient, verifyBearerToken } from "@/lib/supabase-admin"
import {
  DAILY_USER_LIMIT,
  nextUtcMidnightIso,
  wireError,
} from "../../llm/_shared"

/**
 * GET /api/v1/usage/today
 *
 * Auth: Bearer <supabase session accessToken>.
 * Returns the signed-in user's today-tokens snapshot, used by `helpbase whoami`.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authz = req.headers.get("authorization") ?? ""
  const match = /^Bearer\s+(.+)$/i.exec(authz)
  if (!match) {
    return wireError(401, "auth_required", "Missing or malformed Authorization header.")
  }
  const user = await verifyBearerToken(match[1]!)
  if (!user) {
    return wireError(401, "auth_required", "Invalid or expired session token.")
  }

  const client = getServiceRoleClient()
  const { data, error } = await client.rpc("get_user_tokens_today", {
    p_user_id: user.userId,
  })
  if (error) {
    return wireError(503, "internal_error", "Supabase is unavailable.")
  }

  const body: UsageTodayResponse = {
    email: user.email ?? "",
    quota: {
      usedToday: Number(data ?? 0),
      dailyLimit: DAILY_USER_LIMIT,
      resetAt: nextUtcMidnightIso(),
    },
  }
  return NextResponse.json(body)
}
