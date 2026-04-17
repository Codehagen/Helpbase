import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getUsageTodayForUser } from "@/lib/data/usage"
import { wireError } from "../../llm/_shared"

/**
 * GET /api/v1/usage/today
 *
 * Auth: Bearer <Better Auth session token>.
 * Returns the signed-in user's today-tokens snapshot, used by `helpbase whoami`
 * and (server-prefetched) by the /admin/usage page.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth.api.getSession({ headers: req.headers })
  if (!session?.user?.id) {
    return wireError(401, "auth_required", "Missing, malformed, or expired session token.")
  }

  try {
    const body = await getUsageTodayForUser(session.user.id, session.user.email ?? "")
    return NextResponse.json(body)
  } catch (err) {
    // Log the underlying error with the user id so a 503 spike doesn't
    // require guessing from request timing. `userId` is safe to log;
    // email is not.
    console.error("[/api/v1/usage/today] RPC failure", {
      userId: session.user.id,
      error: err instanceof Error ? err.message : String(err),
    })
    return wireError(503, "internal_error", "Supabase is unavailable.")
  }
}
