import { NextResponse, type NextRequest } from "next/server"
import { jsonError, requireOwnedTenant } from "../../_shared"

/**
 * GET /api/v1/tenants/:id/state
 *   auth: Bearer <Better Auth session token>
 *   returns: {
 *     deploy_version: number,          // monotonic counter; client passes this
 *                                      // back on the next deploy for optimistic
 *                                      // concurrency
 *     articles: [{                     // metadata ONLY; no content bodies
 *       slug, category, title, description, file_path,
 *       content_hash,                  // SHA-256 from @workspace/shared/article-hash;
 *                                      // empty string for pre-v2 rows
 *       updated_at,
 *       order, tags, featured, hero_image, video_embed,
 *     }],
 *     categories: [{ slug, title, description, icon, order }],
 *   }
 *
 * Powers `helpbase deploy --preview`: CLI hashes its local `content/`, fetches
 * this endpoint, diffs by (category, slug) identity. Metadata-only payload so
 * the preview round-trip stays small (~kb for hundreds of articles) even
 * though tenant_articles.content is large.
 *
 * Fresh reservation (never deployed) returns empty arrays and deploy_version
 * 0 — the CLI renders "all N new locally" without bouncing on the remote.
 * The endpoint itself does not require the tenant to have deployed; ownership
 * is all that's gated.
 *
 * IMPORTANT: force-dynamic. Without it, Vercel ISR will cache the previous
 * snapshot and clients computing diffs against a stale snapshot will preview
 * the wrong changeset. Flagged as a critical gap by the eng review.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params
  const owned = await requireOwnedTenant(req, id)
  if (owned instanceof NextResponse) return owned
  const { tenant, admin } = owned

  const [{ data: articles, error: articlesErr }, { data: categories, error: catsErr }] =
    await Promise.all([
      admin
        .from("tenant_articles")
        .select(
          "slug, category, title, description, file_path, content_hash, updated_at, order, tags, featured, hero_image, video_embed",
        )
        .eq("tenant_id", tenant.id),
      admin
        .from("tenant_categories")
        .select("slug, title, description, icon, order")
        .eq("tenant_id", tenant.id),
    ])
  if (articlesErr || catsErr) {
    console.error("[tenants.state] supabase read error", {
      tenantId: tenant.id,
      articlesErr,
      catsErr,
    })
    return jsonError(503, "state_fetch_failed", "Could not load tenant state.")
  }

  return NextResponse.json({
    deploy_version: tenant.deploy_version ?? 0,
    articles: articles ?? [],
    categories: categories ?? [],
  })
}
