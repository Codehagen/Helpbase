import { NextResponse, type NextRequest } from "next/server"
import { revalidatePath } from "next/cache"
import { jsonError, requireOwnedTenant } from "../../_shared"

/**
 * POST /api/v1/tenants/:id/deploy
 *   auth: Bearer <Better Auth session token>
 *   body: { categories: [...], articles: [...], chunks: [...], validation_report?: {...} }
 *   returns: { deploy_id, article_count, chunk_count, slug }
 *
 * Server-side port of what the CLI's `deploy` command used to do by
 * calling the `deploy_tenant` RPC directly over a JWT-auth Supabase
 * client. Ownership is enforced here (requireOwnedTenant) before the
 * RPC fires; the RPC itself now trusts the caller (service-role).
 *
 * Also flushes the tenant's ISR cache so `{slug}.helpbase.dev` serves
 * fresh content. Replaces /api/revalidate as the post-deploy hook from
 * the CLI's perspective — one round-trip instead of two.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params
  const owned = await requireOwnedTenant(req, id)
  if (owned instanceof NextResponse) return owned
  const { tenant, admin } = owned

  let body: {
    categories?: unknown[]
    articles?: unknown[]
    chunks?: unknown[]
    validation_report?: Record<string, unknown>
  }
  try {
    body = await req.json()
  } catch {
    return jsonError(400, "invalid_body", "Expected JSON {categories, articles, chunks}.")
  }
  if (!Array.isArray(body.categories) || !Array.isArray(body.articles) || !Array.isArray(body.chunks)) {
    return jsonError(400, "invalid_body", "categories, articles, chunks must be arrays.")
  }

  const { data: deployId, error } = await admin.rpc("deploy_tenant", {
    p_tenant_id: tenant.id,
    p_categories: body.categories as never,
    p_articles: body.articles as never,
    p_chunks: body.chunks as never,
    p_validation_report: (body.validation_report ?? {}) as never,
  })
  if (error) {
    return jsonError(503, "deploy_failed", error.message)
  }

  // Count rows post-deploy so the CLI can print a helpful summary.
  const [{ count: articleCount }, { count: chunkCount }] = await Promise.all([
    admin
      .from("tenant_articles")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenant.id),
    admin
      .from("tenant_chunks")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenant.id),
  ])

  // Fire ISR revalidation for the tenant's subdomain pages. Safe-to-ignore
  // errors — cache will self-heal on the next 1h TTL.
  try {
    revalidatePath(`/t/${tenant.slug}`, "layout")
  } catch {
    // best-effort
  }

  return NextResponse.json({
    deploy_id: deployId,
    article_count: articleCount ?? 0,
    chunk_count: chunkCount ?? 0,
    slug: tenant.slug,
  })
}
