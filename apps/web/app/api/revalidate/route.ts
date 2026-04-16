import { NextResponse, type NextRequest } from "next/server"
import { revalidatePath } from "next/cache"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/types/supabase"

/**
 * POST /api/revalidate
 *   body: { tenant_id: string }
 *   auth: Bearer <supabase-session-access-token> (from the CLI's authed session)
 *
 * Called by `helpbase deploy` after a successful RPC to flush the ISR cache
 * for the tenant's pages. Without this, pages served under
 * `{slug}.helpbase.dev/...` (ISR, 1h TTL) keep serving stale content for up
 * to an hour after the deploy — which breaks trust on the first deploy.
 *
 * Security: the caller's access-token must belong to the tenant owner.
 * We use the anon Supabase client with the user's JWT to read `tenants`
 * under RLS — the `tenants_select_public` policy + the owner_id check in
 * the query form a belt-and-suspenders filter. Service role is NOT used
 * here; only the rightful owner should be able to revalidate their tenant.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""

export async function POST(req: NextRequest) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 })
  }

  // Extract bearer token (Supabase session access token from the CLI).
  const authHeader = req.headers.get("authorization") ?? ""
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim())
  const accessToken = match?.[1]
  if (!accessToken) {
    return NextResponse.json({ error: "missing bearer token" }, { status: 401 })
  }

  // Parse body.
  let body: { tenant_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 })
  }
  const tenantId = body.tenant_id
  if (!tenantId || typeof tenantId !== "string") {
    return NextResponse.json({ error: "tenant_id is required" }, { status: 400 })
  }

  // Resolve tenant + verify ownership via the caller's JWT.
  // createClient + Authorization header = queries run as that user under RLS.
  const client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })

  const { data: userData } = await client.auth.getUser(accessToken)
  const userId = userData.user?.id
  if (!userId) {
    return NextResponse.json({ error: "invalid session" }, { status: 401 })
  }

  const { data: tenant, error } = await client
    .from("tenants")
    .select("slug, owner_id")
    .eq("id", tenantId)
    .single()

  if (error || !tenant) {
    return NextResponse.json({ error: "tenant not found" }, { status: 404 })
  }
  if (tenant.owner_id !== userId) {
    return NextResponse.json({ error: "not tenant owner" }, { status: 403 })
  }

  // Flush the tenant's ISR cache. Layout-scoped revalidation covers both the
  // index and the catch-all article pages under /t/{slug}/....
  revalidatePath(`/t/${tenant.slug}`, "layout")

  return NextResponse.json({ revalidated: true, slug: tenant.slug })
}
