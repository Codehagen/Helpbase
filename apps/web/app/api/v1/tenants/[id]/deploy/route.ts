import { NextResponse, type NextRequest } from "next/server"
import { revalidatePath } from "next/cache"
import { deployPayloadSchema } from "@workspace/shared/schemas"
import { jsonError, requireOwnedTenant } from "../../_shared"

/**
 * POST /api/v1/tenants/:id/deploy
 *   auth: Bearer <Better Auth session token>
 *   body: { categories, articles, chunks, validation_report?, expected_deploy_version? }
 *   returns: { deploy_id, new_deploy_version, article_count, chunk_count, slug }
 *   409 with { error: "stale_deploy_version", current_deploy_version }
 *     when expected_deploy_version was provided and no longer matches.
 *
 * Server-side port of what the CLI's `deploy` command used to do by
 * calling the `deploy_tenant` RPC directly over a JWT-auth Supabase
 * client. Ownership is enforced here (requireOwnedTenant) before the
 * RPC fires; the RPC itself now trusts the caller (service-role).
 *
 * Also flushes the tenant's ISR cache so `{slug}.helpbase.dev` serves
 * fresh content. Replaces /api/revalidate as the post-deploy hook from
 * the CLI's perspective — one round-trip instead of two.
 *
 * As of v2 preview (2026-04-18) the RPC returns a row (deploy_id,
 * new_deploy_version) instead of a scalar. Destructure accordingly.
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

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return jsonError(400, "invalid_body", "Expected JSON {categories, articles, chunks}.")
  }
  // Shared schema — same one the CLI uses to shape the payload. Validate
  // server-side so malformed array elements come back as precise 400s
  // instead of opaque 503 deploy_failed errors from Postgres.
  const parsed = deployPayloadSchema.safeParse(rawBody)
  if (!parsed.success) {
    return jsonError(
      400,
      "invalid_body",
      parsed.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; "),
    )
  }
  const body = parsed.data

  // Supabase's generated RPC types demand the strict `Json` shape
  // (recursive `{ [key: string]: Json | undefined }`), which our Zod
  // types don't satisfy because Frontmatter is `Record<string, unknown>`.
  // The `as never` is a type-system escape valve — the actual runtime
  // safety comes from the deployPayloadSchema parse above.
  const rpcArgs: {
    p_tenant_id: string
    p_categories: never
    p_articles: never
    p_chunks: never
    p_validation_report: never
    p_expected_deploy_version?: number
  } = {
    p_tenant_id: tenant.id,
    p_categories: body.categories as never,
    p_articles: body.articles as never,
    p_chunks: body.chunks as never,
    p_validation_report: (body.validation_report ?? {}) as never,
  }
  // Only send the version check arg when the client explicitly asked
  // for it. The RPC treats NULL as "skip the check", but leaving the
  // param undefined is slightly cleaner in the wire format and matches
  // the pre-v2 behavior for CI callers exactly.
  if (
    body.expected_deploy_version !== null &&
    body.expected_deploy_version !== undefined
  ) {
    rpcArgs.p_expected_deploy_version = body.expected_deploy_version
  }
  const { data, error } = await admin.rpc("deploy_tenant", rpcArgs)
  if (error) {
    // stale_deploy_version raises with SQLSTATE P0001 and a message of the
    // form "stale_deploy_version: expected X, current Y". Translate to a
    // 409 so the CLI's PreviewStaleError handler can auto-refetch. We also
    // parse the "current N" value so the client can re-render the preview
    // without an extra round-trip.
    if (typeof error.message === "string" && error.message.includes("stale_deploy_version")) {
      const m = /current\s+(\d+)/.exec(error.message)
      const currentDeployVersion = m ? Number(m[1]) : null
      return NextResponse.json(
        {
          error: "stale_deploy_version",
          current_deploy_version: currentDeployVersion,
          message:
            "Deploy version has advanced since the preview was fetched. Re-run `helpbase deploy` to see the current state.",
        },
        { status: 409 },
      )
    }
    console.error("[tenants.deploy] supabase rpc error", { tenantId: tenant.id, error })
    return jsonError(503, "deploy_failed", "Deploy RPC failed.")
  }

  // RPC now returns an array of rows (RETURNS TABLE). Happy path: exactly
  // one row with the deploy_id + new_deploy_version we need. Defensive:
  // fall back to zeros so we don't crash on an unexpected empty result.
  const row = Array.isArray(data) ? data[0] : null
  const deployId = row?.deploy_id ?? null
  const newDeployVersion = row?.new_deploy_version ?? 0

  // Re-read the slug AFTER the RPC commits. `tenant.slug` captured by
  // requireOwnedTenant was read before the RPC ran; a concurrent
  // reservation rename between requireOwnedTenant and the RPC could have
  // changed the slug. Pull the authoritative post-deploy value so the
  // response and the revalidatePath both point at the right subdomain.
  // Caught by codex /review on 2026-04-18.
  const { data: freshTenant } = await admin
    .from("tenants")
    .select("slug")
    .eq("id", tenant.id)
    .single()
  const finalSlug = freshTenant?.slug ?? tenant.slug

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

  // Fire ISR revalidation for the tenant's subdomain pages using the
  // post-RPC slug so we don't accidentally revalidate a stale subdomain.
  // Safe-to-ignore errors — cache will self-heal on the next 1h TTL.
  try {
    revalidatePath(`/t/${finalSlug}`, "layout")
  } catch {
    // best-effort
  }

  return NextResponse.json({
    deploy_id: deployId,
    new_deploy_version: newDeployVersion,
    article_count: articleCount ?? 0,
    chunk_count: chunkCount ?? 0,
    slug: finalSlug,
  })
}
