import { Command } from "commander"
import { intro, outro, text, note, cancel, isCancel, confirm, select } from "@clack/prompts"
import { spinner, nextSteps, summaryTable } from "../lib/ui.js"
import pc from "picocolors"
import fs from "node:fs"
import path from "node:path"
import matter from "gray-matter"
import { frontmatterSchema, categoryMetaSchema, type TenantChunk, type DeployReport } from "@workspace/shared/schemas"
import { hashArticle } from "@workspace/shared/article-hash"
import {
  checkSlugAvailability,
  createTenant as apiCreateTenant,
  deleteTenant as apiDeleteTenant,
  deployTenant as apiDeployTenant,
  getTenant as apiGetTenant,
  getTenantState as apiGetTenantState,
  listMyTenants,
  PreviewStaleError,
  rotateMcpToken as apiRotateMcpToken,
  type TenantState,
} from "../lib/tenants-client.js"
import {
  getCurrentSession,
  isNonInteractive,
  type AuthSession,
} from "../lib/auth.js"
import {
  readProjectConfig,
  removeProjectConfig,
  writeProjectConfig,
} from "../lib/project-config.js"
import { ensureReservation, loadReservation } from "../lib/reservation.js"
import { clearCachedReservation } from "../lib/reservation-cache.js"
import {
  computeDiff,
  diffHasChanges,
  diffHasRemoves,
  renderPreviewTable,
  renderSummaryLine,
  type LocalArticle,
  type LocalCategory,
} from "../lib/article-diff.js"

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/
// Kept in sync with RESERVED_SLUGS in link.ts and the subdomain-middleware allowlist.
// Any subdomain that collides with a marketing page, auth surface, or infra path.
const RESERVED_SLUGS = new Set([
  "www", "app", "api", "admin", "dashboard", "docs", "help", "blog", "status", "mail",
  "mcp", "deploy", "login", "signup", "signin", "auth", "billing", "support",
  "cdn", "static", "assets", "files", "media", "images", "img",
])

/**
 * Internal shape after validateAndReadContent(). Articles carry a
 * pre-computed content_hash so both the preview diff and the deploy
 * payload can use the same value without hashing twice.
 */
interface ReadContent {
  categories: Array<{
    slug: string
    title: string
    description: string
    icon: string
    order: number
  }>
  articles: Array<{
    slug: string
    category: string
    title: string
    description: string
    content: string
    frontmatter: Record<string, unknown>
    content_hash: string
    order: number
    tags: string[]
    heroImage: string | null
    videoEmbed: string | null
    featured: boolean
    filePath: string
  }>
}

export const deployCommand = new Command("deploy")
  .description(
    "Deploy your help center to helpbase cloud. Shows a preview on removes; " +
    "silent on routine adds/updates. For local MDX preview (browser dev " +
    "server), see `helpbase preview` — separate command.",
  )
  .option("--slug <slug>", "Subdomain slug (e.g., my-product)")
  .option(
    "--preview",
    "Show what would change against the deployed tenant, without deploying. " +
    "Exits 0. For local browser preview of MDX, use `helpbase preview`.",
  )
  .option("--yes", "Skip the confirmation prompt when removes are detected.")
  .option(
    "--rotate-mcp-token",
    "Rotate the tenant's MCP bearer token (invalidates all currently-active clients). Does not publish content.",
  )
  .option(
    "--delete <slug>",
    "Hard-delete a tenant and release its slug. Requires owner match. Cascades to articles, categories, chunks, deploys, and queries.",
  )
  .addHelpText(
    "after",
    `
Examples:
  $ helpbase deploy                                            # smart: silent on adds/updates, prompts on removes
  $ helpbase deploy --preview                                  # show what would change, don't deploy
  $ helpbase deploy --slug acme-docs                           # first deploy with explicit slug
  $ helpbase deploy --yes                                      # skip the removes-confirmation prompt (CI-friendly)
  $ HELPBASE_TOKEN=xxx helpbase deploy --slug acme-docs        # CI / non-interactive (preview skipped)
  $ helpbase deploy --rotate-mcp-token                         # rotate MCP token only
  $ helpbase deploy --delete acme-docs --yes                   # delete tenant + release slug
`,
  )
  .action(
    async (opts: {
      slug?: string
      preview?: boolean
      rotateMcpToken?: boolean
      delete?: string
      yes?: boolean
    }) => {
      intro(pc.bgCyan(pc.black(" helpbase deploy ")))

      // 0. --delete short-circuit: auth + delete + exit. Skips content checks
      //    and tenant-by-link resolution because the target tenant is supplied
      //    explicitly as --delete <slug>.
      if (opts.delete) {
        await handleDelete(opts.delete, { yes: opts.yes ?? false })
        return
      }

      // 1. Local validation BEFORE auth. Content existence + frontmatter
      //    validity are deterministic local checks with zero server
      //    interaction; surfacing them first keeps the error the user
      //    sees aligned with the problem they actually have. A dev in
      //    an empty folder should not be told "Not signed in" — that's
      //    the DX audit from 2026-04-18 speaking. Skipped for
      //    --rotate-mcp-token since it doesn't touch content.
      //    validateAndReadContent owns the existence check + error
      //    messaging (with the `npx create-helpbase` hint).
      const contentDir = path.resolve("content")
      const content: ReadContent | null = opts.rotateMcpToken
        ? null
        : validateAndReadContent(contentDir)

      // 2. Auth. validateAndReadContent above exits on errors, so by the
      //    time we hit this we've confirmed the local project shape is
      //    deployable. Any auth-path error that surfaces now is the real
      //    blocker, not a noise-on-top-of-something-else error.
      const session = await ensureAuthenticated()

      // --rotate-mcp-token short-circuit: resolve tenant, rotate, exit.
      // Matches prior behavior — no content read, no state fetch, no
      // preview.
      if (opts.rotateMcpToken) {
        const { tenantId, tenantSlug } = await resolveTenantForRotate(session, opts)
        await rotateAndReport(session, tenantId, tenantSlug)
        return
      }

      // content is non-null here because the only path that leaves it null
      // above is --rotate-mcp-token, which returned early.
      if (!content) {
        cancel("Internal error: content missing after validation.")
        process.exit(1)
      }

      // 2. Resolve the target tenant. May auto-provision via reservation
      //    on first deploy; may prompt for a slug if none is linked and
      //    the reservation path doesn't apply. Does NOT create a tenant
      //    unless the user provided --slug or went through the slug
      //    picker — preview on a fresh reservation stays within the
      //    existing row.
      const resolved = await resolveTenant(session, opts, {
        hasLinkedProject: !!readProjectConfig(),
      })

      // 3. Fetch deployed state for diffing. Skipped in non-interactive
      //    mode (CI) for backwards compat — CI users opted out of
      //    optimistic concurrency explicitly in T2B. If the tenant is
      //    brand new (reservation row with no deploys yet) or /state
      //    returns null, diff against an empty remote.
      const skipStateFetch = isNonInteractive()
      let remoteState: TenantState | null = null
      let stateFetchFailed = false
      if (!skipStateFetch) {
        try {
          remoteState = await apiGetTenantState(session, resolved.tenantId)
        } catch (err) {
          // Any non-404 failure — 5xx, network timeout, unexpected 403
          // after a slug rename — falls through to the "deploy without
          // preview?" fallback below. Never block a deploy on a flaky
          // read endpoint. Error logged for debugging, not surfaced as a
          // stack to the user.
          stateFetchFailed = true
          const msg = err instanceof Error ? err.message : String(err)
          process.stderr.write(
            `${pc.yellow("⚠")} Preview fetch failed: ${pc.dim(msg)}\n`,
          )
        }
      }

      const diff = remoteState
        ? computeDiff(toDiffInput(content), remoteState)
        : computeDiff(toDiffInput(content), { articles: [], categories: [] })

      // 4. --preview mode: render the table and exit 0 without deploying.
      //    This works even on a fresh reservation (all local articles
      //    appear as "added"; no remote fetch needed because remoteState
      //    is null and we used an empty remote above).
      if (opts.preview) {
        renderPreviewOutput(resolved.tenantSlug, diff, content, remoteState, {
          stateFetchFailed,
          skippedForCi: skipStateFetch,
        })
        outro(`${pc.dim("Preview complete. Run without --preview to deploy.")}`)
        return
      }

      // 5. Fallback path when /state failed — ask permission to deploy
      //    blind (no concurrency protection, no change summary).
      if (stateFetchFailed && !opts.yes) {
        const proceed = await confirm({
          message: "Preview unavailable. Deploy without seeing what will change?",
          initialValue: false,
        })
        if (isCancel(proceed) || !proceed) {
          cancel("Cancelled.")
          process.exit(0)
        }
      }

      // 6. Smart-prompt (D1A): silent on no-removes (routine add/update),
      //    full preview + prompt when destructive changes are in the diff.
      //    --yes skips the prompt. Non-interactive always skips.
      const mustPrompt =
        !opts.yes && !isNonInteractive() && remoteState !== null && diffHasRemoves(diff)
      if (mustPrompt) {
        process.stdout.write(`\n${renderPreviewTable(diff)}\n\n`)
        const proceed = await confirm({
          message: "Proceed with deploy? This will remove articles or categories from your tenant.",
          initialValue: false,
        })
        if (isCancel(proceed) || !proceed) {
          cancel("Cancelled — nothing deployed.")
          process.exit(0)
        }
      } else if (remoteState !== null && !opts.preview) {
        // Silent happy path — show a one-line summary so users know what
        // shipped without the full table clutter. Skipped when we're about
        // to render the table via the prompt above.
        if (diffHasChanges(diff)) {
          note(renderSummaryLine(diff), "Deploying")
        } else {
          // Nothing to ship. Exit early — deploying "no changes" still
          // bumps deploy_version and revalidates the ISR cache, which is
          // wasteful when there's nothing to do.
          outro(`${pc.green("✓")} No changes. Your tenant is already up to date.`)
          return
        }
      }

      // 7. Perform the deploy. Passes expected_deploy_version when we
      //    fetched remoteState successfully, so concurrent deploys get
      //    rejected with PreviewStaleError. D3A auto-retry handles that
      //    once; a second stale is surfaced to the user.
      const outcome = await performDeploy(session, resolved, content, {
        expectedVersion: remoteState?.deploy_version ?? null,
        previouslyDiffed: remoteState,
        diff,
      })

      // Reservation cache clearing runs for BOTH the direct-success and
      // the stale-retry-success paths — previously it only ran on direct
      // success, so a first-deploy that landed via the retry path left a
      // stale "reserved" entry in whoami. Caught by codex /review on
      // 2026-04-18.
      if (resolved.usedReservation && outcome.kind !== "aborted") {
        clearCachedReservation()
      }

      if (outcome.kind === "noop") {
        // Concurrent client shipped the same content while we were
        // reviewing. The tenant is in the state we intended, so exit 0.
        // Previously this path exited 1, which broke CI loops. Caught by
        // codex /review on 2026-04-18.
        return
      }
      if (outcome.kind === "aborted") {
        // User cancelled at the retry prompt, or a non-PreviewStale error
        // inside the retry. cancel() already printed the reason; exit 1
        // so shells/CI see a failure.
        process.exit(1)
      }

      // Fetch mcp_public_token post-deploy so we can print the paste-ready
      // MCP client config block. Best-effort — the deploy already succeeded
      // so a token-read failure should degrade to "no config snippet" not
      // a visible error.
      const tenantAfter = await apiGetTenant(session, outcome.finalTenantId).catch(
        () => null,
      )
      const mcpToken = tenantAfter?.mcp_public_token ?? ""

      printDeploySuccess(resolved.tenantSlug, content, outcome, mcpToken)
    },
  )

// ───────────────────────────────────────────────────────────────────────
// Helpers extracted from the prior monolithic .action() body (5B refactor).
// Each does one thing; the action above orchestrates them.
// ───────────────────────────────────────────────────────────────────────

/**
 * Read + validate everything under `content/`. Fails cleanly on
 * malformed frontmatter, empty article bodies, and invalid
 * `_category.json` files. Computes content_hash for each article so
 * both the preview diff and the deploy payload reuse the same value.
 *
 * Exits the process on any validation error — the same contract as
 * the pre-v2 2.5-step body. Preserves the "no tenant write before
 * content is known-good" invariant.
 */
function validateAndReadContent(contentDir: string): ReadContent {
  if (!fs.existsSync(contentDir)) {
    cancel(
      "No content/ directory found. Run this from a helpbase project root, or create one:\n" +
      pc.cyan("  npx create-helpbase"),
    )
    process.exit(1)
  }
  const s = spinner()
  s.start("Reading content...")
  const errors: string[] = []
  const categories: ReadContent["categories"] = []
  const articles: ReadContent["articles"] = []

  const categoryDirs = fs
    .readdirSync(contentDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())

  for (const dir of categoryDirs) {
    const categorySlug = dir.name
    const categoryPath = path.join(contentDir, categorySlug)

    const metaPath = path.join(categoryPath, "_category.json")
    let meta = { title: categorySlug, description: "", icon: "file-text", order: 999 }
    if (fs.existsSync(metaPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(metaPath, "utf-8"))
        const parsed = categoryMetaSchema.safeParse(raw)
        if (parsed.success) {
          meta = parsed.data
        } else {
          errors.push(
            `${categorySlug}/_category.json: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
          )
        }
      } catch {
        errors.push(`${categorySlug}/_category.json: Invalid JSON`)
      }
    }

    categories.push({ slug: categorySlug, ...meta })

    const files = fs
      .readdirSync(categoryPath)
      .filter((f) => f.endsWith(".mdx") || f.endsWith(".md"))

    for (const file of files) {
      const filePath = path.join(categoryPath, file)
      const raw = fs.readFileSync(filePath, "utf-8")
      const { data, content: body } = matter(raw)

      const parsed = frontmatterSchema.safeParse(data)
      if (!parsed.success) {
        errors.push(
          `${categorySlug}/${file}: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
        )
        continue
      }

      const articleSlug = file.replace(/\.mdx?$/, "")

      // Empty body = ghost article: title appears in search, clickable,
      // renders a blank page. Catch at deploy time. CodeRabbit, PR #10.
      if (body.trim().length === 0) {
        errors.push(
          `${categorySlug}/${file}: article body is empty (add content below the frontmatter)`,
        )
        continue
      }

      const content_hash = hashArticle({
        title: parsed.data.title,
        description: parsed.data.description,
        frontmatter: data as Record<string, unknown>,
        content: body,
      })

      articles.push({
        slug: articleSlug,
        category: categorySlug,
        title: parsed.data.title,
        description: parsed.data.description,
        content: body,
        frontmatter: data as Record<string, unknown>,
        content_hash,
        order: parsed.data.order,
        tags: parsed.data.tags,
        heroImage: parsed.data.heroImage ?? null,
        videoEmbed: parsed.data.videoEmbed ?? null,
        featured: parsed.data.featured ?? false,
        filePath: `content/${categorySlug}/${file}`,
      })
    }
  }

  s.stop(`Found ${categories.length} categories, ${articles.length} articles`)

  if (errors.length > 0) {
    cancel(
      `${errors.length} article(s) have invalid frontmatter:\n` +
        errors.map((e) => `  ${pc.red("•")} ${e}`).join("\n") +
        "\n\nFix these and run helpbase deploy again.",
    )
    process.exit(1)
  }

  if (articles.length === 0) {
    cancel(
      "No articles found in content/.\n" +
        `Generate some: ${pc.cyan("helpbase generate --url <your-site>")}`,
    )
    process.exit(1)
  }

  return { categories, articles }
}

interface ResolvedTenant {
  tenantId: string
  tenantSlug: string
  usedReservation: boolean
  linkedProjectConfig: boolean
}

/**
 * Priority: .helpbase/project.json → reservation → owner lookup (single
 * tenant) → interactive picker (multi) → explicit --slug or create-new
 * prompt. Mirrors the pre-v2 control flow; pulled out so the main action
 * reads as orchestration.
 */
async function resolveTenant(
  session: AuthSession,
  opts: { slug?: string },
  context: { hasLinkedProject: boolean },
): Promise<ResolvedTenant> {
  const linked = readProjectConfig()
  if (linked) {
    const tenant = await apiGetTenant(session, linked.tenantId).catch(() => null)
    if (tenant && tenant.active) {
      return {
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        usedReservation: false,
        linkedProjectConfig: true,
      }
    }
    cancel(
      `Linked tenant "${linked.slug}" not found, inactive, or not owned by you.\n` +
      `  Run ${pc.cyan("helpbase link --remove")} then ${pc.cyan("helpbase link")} to fix.`,
    )
    process.exit(1)
  }

  const tenants = await listMyTenants(session)
  let usedReservation = false

  // Reservation-first on first deploy: if the user has no deployed
  // tenants and didn't pass --slug, prefer the auto-provisioned
  // reservation over the slug picker. Matches the DX review's
  // TTHW target.
  if (tenants.length === 0 && !opts.slug) {
    let reservation = await loadReservation(session, { forceRefresh: true }).catch(
      () => null,
    )
    if (!reservation) {
      const ensured = await ensureReservation(session)
      if (ensured) {
        reservation = await loadReservation(session, { forceRefresh: true }).catch(
          () => null,
        )
      }
    }
    if (reservation) {
      writeProjectConfig({ tenantId: reservation.tenantId, slug: reservation.slug })
      note(
        `Deploying to ${pc.cyan(`${reservation.slug}.helpbase.dev`)} ${pc.dim("(reserved at login)")}`,
        "Tenant",
      )
      return {
        tenantId: reservation.tenantId,
        tenantSlug: reservation.slug,
        usedReservation: true,
        linkedProjectConfig: false,
      }
    }
  }

  if (tenants.length === 1) {
    const only = tenants[0]!
    writeProjectConfig({ tenantId: only.id, slug: only.slug })
    note(`Deploying to ${pc.cyan(`${only.slug}.helpbase.dev`)}`, "Tenant")
    return {
      tenantId: only.id,
      tenantSlug: only.slug,
      usedReservation,
      linkedProjectConfig: false,
    }
  }

  if (tenants.length > 1 && opts.slug) {
    const match = tenants.find((t) => t.slug === opts.slug)
    if (match) {
      writeProjectConfig({ tenantId: match.id, slug: match.slug })
      note(`Deploying to ${pc.cyan(`${match.slug}.helpbase.dev`)}`, "Tenant")
      return {
        tenantId: match.id,
        tenantSlug: match.slug,
        usedReservation,
        linkedProjectConfig: false,
      }
    }
    // --slug didn't match any owned tenant — fall through to create-new.
  }

  if (tenants.length > 1 && !opts.slug) {
    if (isNonInteractive()) {
      cancel(
        `You own ${tenants.length} tenants. Pass ${pc.cyan("--slug <name>")} ` +
        `to pick one in non-interactive mode.`,
      )
      process.exit(1)
    }
    const pickedValue = await select({
      message: "You own multiple tenants. Which one should this project deploy to?",
      options: [
        ...tenants.map((t) => ({
          value: t.id,
          label: `${t.slug}.helpbase.dev`,
          hint: t.name ?? undefined,
        })),
        { value: "__new__", label: pc.cyan("+ Create a new tenant") },
      ],
    })
    if (isCancel(pickedValue)) {
      cancel("Cancelled.")
      process.exit(0)
    }
    if (pickedValue !== "__new__") {
      const picked = tenants.find((t) => t.id === pickedValue)!
      writeProjectConfig({ tenantId: picked.id, slug: picked.slug })
      note(`Deploying to ${pc.cyan(`${picked.slug}.helpbase.dev`)}`, "Tenant")
      return {
        tenantId: picked.id,
        tenantSlug: picked.slug,
        usedReservation,
        linkedProjectConfig: false,
      }
    }
  }

  // Create new tenant path — explicit --slug or user asked for __new__
  const created = await createNewTenant(session, opts.slug)
  return {
    tenantId: created.id,
    tenantSlug: created.slug,
    usedReservation: false,
    linkedProjectConfig: false,
  }
}

async function createNewTenant(
  session: AuthSession,
  explicitSlug?: string,
): Promise<{ id: string; slug: string }> {
  let slug = explicitSlug
  if (!slug) {
    if (isNonInteractive()) {
      cancel(
        "Non-interactive mode (HELPBASE_TOKEN set) requires --slug <name> on first deploy.",
      )
      process.exit(1)
    }
    const input = await text({
      message: "Choose a subdomain for your help center:",
      placeholder: "my-product",
      validate: (v) => {
        if (!v) return "Subdomain is required"
        if (!SLUG_REGEX.test(v)) return "Use lowercase letters, numbers, and hyphens"
        if (v.length < 3) return "Must be at least 3 characters"
        if (v.length > 40) return "Must be 40 characters or less"
        if (RESERVED_SLUGS.has(v)) return `"${v}" is reserved. Choose another.`
        return undefined
      },
    })
    if (isCancel(input)) {
      cancel("Cancelled.")
      process.exit(0)
    }
    slug = input as string
  }

  const availability = await checkSlugAvailability(slug)
  if (!availability.available) {
    cancel(`Subdomain "${slug}" is already taken. Try another with --slug <name>`)
    process.exit(1)
  }

  let newTenant: Awaited<ReturnType<typeof apiCreateTenant>>
  try {
    newTenant = await apiCreateTenant(session, slug)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/slug_taken|slug_reserved/.test(msg)) {
      cancel(`Subdomain "${slug}" is unavailable. Try another with --slug <name>`)
    } else {
      cancel(`Failed to create tenant: ${msg}`)
    }
    process.exit(1)
  }
  writeProjectConfig({ tenantId: newTenant.id, slug: newTenant.slug })
  note(
    `Created ${pc.cyan(`${newTenant.slug}.helpbase.dev`)}\n` +
    `Wrote ${pc.dim(".helpbase/project.json")} — commit it so teammates deploy to the same tenant.`,
    "New help center",
  )
  return { id: newTenant.id, slug: newTenant.slug }
}

async function resolveTenantForRotate(
  session: AuthSession,
  opts: { slug?: string },
): Promise<ResolvedTenant> {
  // Rotation needs a tenant but never a content read. Reuse resolveTenant's
  // linked/single/picker logic; don't force reservation auto-provision
  // (you can't rotate a token on a tenant that's never had one).
  return resolveTenant(session, opts, { hasLinkedProject: !!readProjectConfig() })
}

async function rotateAndReport(
  session: AuthSession,
  tenantId: string,
  tenantSlug: string,
): Promise<void> {
  const s = spinner()
  s.start("Rotating MCP token...")
  let newToken: string
  try {
    newToken = await apiRotateMcpToken(session, tenantId)
  } catch (err) {
    s.stop("Rotation failed")
    cancel(`Failed to rotate token: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
  s.stop(`Rotated MCP token for ${tenantSlug}`)
  const mcpUrl = `https://${tenantSlug}.helpbase.dev/mcp`
  const mcpConfig = JSON.stringify(
    {
      mcpServers: {
        [tenantSlug]: {
          url: mcpUrl,
          headers: { Authorization: `Bearer ${newToken}` },
        },
      },
    },
    null,
    2,
  )
  outro(`${pc.green("✓")} Token rotated.`)
  note(
    `${pc.yellow("⚠")}  All currently-active MCP clients have been invalidated.\n` +
    `    Paste the new config into every client that queries this tenant:\n\n${pc.dim(mcpConfig)}`,
    "New MCP config",
  )
}

/**
 * Turn the validated content into the shape computeDiff() expects.
 * Pure mapping; no I/O.
 */
function toDiffInput(content: ReadContent): {
  articles: LocalArticle[]
  categories: LocalCategory[]
} {
  return {
    articles: content.articles.map((a) => ({
      slug: a.slug,
      category: a.category,
      title: a.title,
      description: a.description,
      file_path: a.filePath,
      content_hash: a.content_hash,
      order: a.order,
      tags: a.tags,
      featured: a.featured,
      hero_image: a.heroImage,
      video_embed: a.videoEmbed,
    })),
    categories: content.categories.map((c) => ({
      slug: c.slug,
      title: c.title,
      description: c.description,
      icon: c.icon,
      order: c.order,
    })),
  }
}

function renderPreviewOutput(
  tenantSlug: string,
  diff: ReturnType<typeof computeDiff>,
  content: ReadContent,
  remoteState: TenantState | null,
  ctx: { stateFetchFailed: boolean; skippedForCi: boolean },
): void {
  if (ctx.stateFetchFailed) {
    note(
      `${pc.yellow("⚠")} Could not fetch deployed state. Showing local content only.`,
      "Preview",
    )
  } else if (ctx.skippedForCi) {
    note(
      `${pc.dim("Non-interactive mode skips state fetch. Preview shown against empty remote.")}`,
      "Preview",
    )
  } else if (remoteState === null) {
    note(
      `First deploy for ${pc.cyan(`${tenantSlug}.helpbase.dev`)}. All articles shown as added.`,
      "Preview",
    )
  } else {
    note(`Comparing ${pc.cyan(`${tenantSlug}.helpbase.dev`)} against local ${pc.cyan("content/")}`, "Preview")
  }
  process.stdout.write(`\n${renderPreviewTable(diff)}\n\n`)
  summaryTable([
    ["Local articles", String(content.articles.length)],
    ["Local categories", String(content.categories.length)],
    ["Remote deploy_version", String(remoteState?.deploy_version ?? 0)],
  ])
}

interface PerformDeployInput {
  expectedVersion: number | null
  previouslyDiffed: TenantState | null
  diff: ReturnType<typeof computeDiff>
}

/**
 * Tri-state outcome so the caller can distinguish "we shipped" (deployed)
 * from "someone else shipped the same content while we were reviewing"
 * (noop, still a success — the tenant is in the state we wanted) from
 * "the user cancelled or we hit a hard retry failure" (aborted).
 */
type DeployOutcome =
  | {
      kind: "deployed"
      deployId: string
      newDeployVersion: number
      articleCount: number
      chunkCount: number
      finalSlug: string
      finalTenantId: string
    }
  | { kind: "noop" }
  | { kind: "aborted" }

async function performDeploy(
  session: AuthSession,
  resolved: ResolvedTenant,
  content: ReadContent,
  ctx: PerformDeployInput,
): Promise<DeployOutcome> {
  const { tenantId } = resolved

  const chunks = computeChunks(content)
  const validationReport: DeployReport = {
    kept_count: content.articles.length,
    dropped_count: 0,
    dropped: [],
    ran_at: new Date().toISOString(),
  }
  const payload = buildDeployPayload(content, chunks, validationReport, ctx.expectedVersion)

  const s = spinner()
  s.start("Publishing (atomic)...")
  let result: Awaited<ReturnType<typeof apiDeployTenant>>
  try {
    result = await apiDeployTenant(session, tenantId, payload)
  } catch (err) {
    if (err instanceof PreviewStaleError) {
      s.stop(pc.yellow("Remote changed during review."))
      // D3A auto-retry: refetch /state, recompute diff, re-prompt (if
      // removes) or proceed silently (if not). Capped at one retry to
      // avoid infinite loops under contention.
      return stalePreviewRetry(session, resolved, content, validationReport, chunks)
    }
    s.stop("Deploy failed")
    cancel(`Deploy error: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
  s.stop(
    `Published ${result.article_count} articles, ${result.chunk_count} chunks ` +
      `(deploy ${result.deploy_id.slice(0, 8)}, version ${result.new_deploy_version})`,
  )

  return {
    kind: "deployed",
    deployId: result.deploy_id,
    newDeployVersion: result.new_deploy_version,
    articleCount: result.article_count,
    chunkCount: result.chunk_count,
    finalSlug: result.slug,
    finalTenantId: tenantId,
  }
}

async function stalePreviewRetry(
  session: AuthSession,
  resolved: ResolvedTenant,
  content: ReadContent,
  validationReport: DeployReport,
  chunks: TenantChunk[],
): Promise<DeployOutcome> {
  const s = spinner()
  s.start("Fetching updated state...")
  let freshState: TenantState | null
  try {
    freshState = await apiGetTenantState(session, resolved.tenantId)
  } catch (err) {
    s.stop("Could not refetch state")
    cancel(
      `${pc.red("✖")} Deploy aborted: remote state changed and refresh failed (${err instanceof Error ? err.message : String(err)}).\n` +
        `  Run ${pc.cyan("helpbase deploy --preview")} to see the current state.`,
    )
    return { kind: "aborted" }
  }
  s.stop("Fetched updated state")

  const freshDiff = computeDiff(toDiffInput(content), freshState ?? { articles: [], categories: [] })

  // "Remote now matches" = concurrent client shipped the same content we
  // were about to ship. Our intent is satisfied; treat as a success exit
  // so CI loops don't spuriously fail. Previously returned null and the
  // caller exit 1. Caught by codex /review on 2026-04-18.
  if (!diffHasChanges(freshDiff)) {
    outro(`${pc.green("✓")} Remote now matches your local content. No changes to publish.`)
    return { kind: "noop" }
  }

  process.stdout.write(
    `\n${pc.yellow("⚠")} Remote changed while you were reviewing. Current diff:\n\n${renderPreviewTable(freshDiff)}\n\n`,
  )

  // Re-prompt: the user's first confirmation was based on stale info,
  // so they re-confirm against the current state. --yes from the first
  // attempt doesn't carry across a stale-retry, per D3A.
  const proceed = await confirm({
    message: "Still deploy with the current state?",
    initialValue: false,
  })
  if (isCancel(proceed) || !proceed) {
    cancel("Cancelled — nothing deployed.")
    return { kind: "aborted" }
  }

  // Re-run the deploy with the fresh deploy_version. A SECOND stale
  // exception surfaces as a hard error — no infinite retry.
  const payload = buildDeployPayload(content, chunks, validationReport, freshState?.deploy_version ?? null)
  const s2 = spinner()
  s2.start("Publishing (atomic, retry)...")
  try {
    const result = await apiDeployTenant(session, resolved.tenantId, payload)
    s2.stop(
      `Published ${result.article_count} articles, ${result.chunk_count} chunks ` +
        `(deploy ${result.deploy_id.slice(0, 8)}, version ${result.new_deploy_version})`,
    )
    return {
      kind: "deployed",
      deployId: result.deploy_id,
      newDeployVersion: result.new_deploy_version,
      articleCount: result.article_count,
      chunkCount: result.chunk_count,
      finalSlug: result.slug,
      finalTenantId: resolved.tenantId,
    }
  } catch (err) {
    s2.stop("Deploy failed")
    if (err instanceof PreviewStaleError) {
      cancel(
        `${pc.red("✖")} Remote changed AGAIN during retry. Giving up to avoid an infinite loop.\n` +
          `  Re-run ${pc.cyan("helpbase deploy")} to start fresh.`,
      )
      return { kind: "aborted" }
    }
    cancel(`Deploy error: ${err instanceof Error ? err.message : String(err)}`)
    return { kind: "aborted" }
  }
}

function buildDeployPayload(
  content: ReadContent,
  chunks: TenantChunk[],
  validationReport: DeployReport,
  expectedVersion: number | null,
) {
  return {
    categories: content.categories.map((c) => ({
      slug: c.slug,
      title: c.title,
      description: c.description,
      icon: c.icon,
      order: c.order,
    })),
    articles: content.articles.map((a) => ({
      slug: a.slug,
      category: a.category,
      title: a.title,
      description: a.description,
      content: a.content,
      content_hash: a.content_hash,
      frontmatter: a.frontmatter,
      order: a.order,
      tags: a.tags,
      hero_image: a.heroImage,
      video_embed: a.videoEmbed,
      featured: a.featured,
      file_path: a.filePath,
    })),
    chunks,
    validation_report: validationReport as unknown as Record<string, unknown>,
    expected_deploy_version: expectedVersion,
  }
}

function computeChunks(content: ReadContent): TenantChunk[] {
  const chunks: TenantChunk[] = []
  for (const a of content.articles) {
    for (const chunk of chunkArticleContent(a.content)) {
      chunks.push({
        article_slug: a.slug,
        article_category: a.category,
        chunk_index: chunk.index,
        content: chunk.content,
        file_path: a.filePath,
        line_start: chunk.lineStart,
        line_end: chunk.lineEnd,
        token_count: chunk.tokenCount,
      })
    }
  }
  return chunks
}

function printDeploySuccess(
  tenantSlug: string,
  content: ReadContent,
  result: Extract<DeployOutcome, { kind: "deployed" }>,
  mcpToken: string,
): void {
  // Use the slug the SERVER echoed — local tenantSlug could be stale after
  // a concurrent rename. Caught by /review codex on 2026-04-18.
  const finalSlug = result.finalSlug || tenantSlug
  const liveUrl = `https://${finalSlug}.helpbase.dev`
  const mcpUrl = `https://${finalSlug}.helpbase.dev/mcp`
  outro(`${pc.green("✓")} Deployed! Your help center is live.`)
  summaryTable([
    ["Tenant", `${finalSlug}.helpbase.dev`],
    ["Articles", String(content.articles.length)],
    ["Chunks", String(result.chunkCount)],
    ["Categories", String(content.categories.length)],
    ["Deploy version", String(result.newDeployVersion)],
    ["Live URL", liveUrl],
    ["MCP URL", mcpUrl],
  ])

  // MCP client config block — paste into Claude Desktop, Claude Code,
  // Cursor, or any MCP-compatible agent. Dropped from printDeploySuccess
  // during the v2 refactor and restored via /review 2026-04-18.
  if (mcpToken) {
    const mcpConfig = JSON.stringify(
      {
        mcpServers: {
          [finalSlug]: {
            url: mcpUrl,
            headers: { Authorization: `Bearer ${mcpToken}` },
          },
        },
      },
      null,
      2,
    )
    note(
      `Paste this into your Claude Desktop / Claude Code / Cursor MCP config:\n\n${pc.dim(mcpConfig)}\n\n` +
        `${pc.yellow("⚠")}  Anyone with this token has full MCP access to this tenant.\n` +
        `    Rotate with ${pc.cyan("helpbase deploy --rotate-mcp-token")} (invalidates all active clients).`,
      "MCP config",
    )
  }

  nextSteps({
    commands: ["helpbase open", "helpbase deploy --preview"],
    urls: [
      { label: "docs:", url: liveUrl },
      { label: "mcp:", url: mcpUrl },
    ],
  })
}

/**
 * Split article MDX into search chunks. Target: ~1600 chars per chunk
 * (≈ 400 tokens at 4 chars/token). Splits on paragraph boundaries
 * (`\n\n+`) so chunks stay semantically coherent. Simple + fast;
 * header-aware/sentence-aware chunking is a v1.5 upgrade if FTS quality
 * flags it as a gap during the week-1 query-log review.
 *
 * Exported for testability.
 */
export function chunkArticleContent(content: string): Array<{
  index: number
  content: string
  lineStart: number
  lineEnd: number
  tokenCount: number
}> {
  const MAX_CHARS = 1600
  const paragraphs = content.split(/\n\n+/)
  const chunks: Array<{
    index: number
    content: string
    lineStart: number
    lineEnd: number
    tokenCount: number
  }> = []

  let buf = ""
  let bufStartLine = 1
  let lineCursor = 1
  let chunkIndex = 0

  const flush = (endLine: number) => {
    const trimmed = buf.trim()
    if (!trimmed) return
    chunks.push({
      index: chunkIndex++,
      content: trimmed,
      lineStart: bufStartLine,
      lineEnd: endLine,
      tokenCount: Math.ceil(trimmed.length / 4),
    })
    buf = ""
  }

  for (const paragraph of paragraphs) {
    const pLines = paragraph.split("\n").length
    if (buf.length > 0 && buf.length + paragraph.length > MAX_CHARS) {
      flush(lineCursor - 1)
      bufStartLine = lineCursor
    }
    if (buf.length > 0) buf += "\n\n"
    buf += paragraph
    lineCursor += pLines + 1 // paragraph lines + the blank separator line
  }
  flush(lineCursor - 1)

  // An article with no paragraphs still deserves a chunk (edge case: tiny docs).
  if (chunks.length === 0 && content.trim().length > 0) {
    chunks.push({
      index: 0,
      content: content.trim(),
      lineStart: 1,
      lineEnd: content.split("\n").length,
      tokenCount: Math.ceil(content.trim().length / 4),
    })
  }

  return chunks
}

async function ensureAuthenticated(): Promise<AuthSession> {
  const existing = await getCurrentSession()
  if (existing) {
    const viaToken = isNonInteractive()
    note(
      viaToken
        ? `Authenticated via HELPBASE_TOKEN ${pc.dim(`(${existing.email || existing.userId})`)}`
        : `Logged in as ${pc.cyan(existing.email)}`,
      "Authentication",
    )
    return existing
  }

  if (isNonInteractive()) {
    cancel("HELPBASE_TOKEN is set but invalid or expired. Re-issue it and try again.")
    process.exit(1)
  }

  cancel(
    `Not signed in. Run ${pc.cyan("helpbase login")} first, then re-run ${pc.cyan("helpbase deploy")}.`,
  )
  process.exit(1)
}

/**
 * Handle `helpbase deploy --delete <slug>`.
 *
 * Authenticates, resolves the target tenant by slug, confirms ownership,
 * prompts for confirmation (unless --yes), and hard-deletes the tenant.
 * Cascading FKs on articles/categories/chunks/deploys/queries drop the
 * rest.
 *
 * If the deleted tenant was the current project's linked tenant, the
 * local `.helpbase/project.json` is removed so the next `helpbase deploy`
 * starts fresh.
 *
 * Non-interactive (HELPBASE_TOKEN set) requires --yes. Missing --yes
 * aborts with a clear message rather than silently skipping confirmation.
 */
async function handleDelete(
  slug: string,
  { yes }: { yes: boolean },
): Promise<void> {
  if (!SLUG_REGEX.test(slug)) {
    cancel(`Invalid slug: "${slug}". Slugs are lowercase letters, numbers, and hyphens.`)
    process.exit(1)
  }

  const session = await ensureAuthenticated()

  const tenants = await listMyTenants(session)
  const tenant = tenants.find((t) => t.slug === slug) ?? null
  if (!tenant) {
    const availability = await checkSlugAvailability(slug).catch(() => null)
    if (availability && !availability.available) {
      cancel(
        `Tenant "${slug}" is not owned by the current user.\n` +
        `  Only the owner can delete a tenant.`,
      )
    } else {
      cancel(`Tenant "${slug}" not found.`)
    }
    process.exit(1)
  }

  if (!yes) {
    if (isNonInteractive()) {
      cancel(
        "Non-interactive mode requires --yes to confirm deletion.\n" +
        pc.dim("  helpbase deploy --delete " + slug + " --yes"),
      )
      process.exit(1)
    }
    const proceed = await confirm({
      message: `Hard-delete tenant "${slug}"? This drops all articles, chunks, and the live URL. Cannot be undone.`,
      initialValue: false,
    })
    if (isCancel(proceed) || !proceed) {
      cancel("Cancelled — nothing deleted.")
      process.exit(0)
    }
  }

  const s = spinner()
  s.start(`Deleting "${slug}"...`)

  try {
    await apiDeleteTenant(session, tenant.id)
  } catch (err) {
    s.stop("Delete failed")
    cancel(`Failed to delete tenant: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }

  const linked = readProjectConfig()
  if (linked && linked.tenantId === tenant.id) {
    removeProjectConfig()
    s.stop(`Deleted "${slug}" and removed local .helpbase/project.json`)
  } else {
    s.stop(`Deleted "${slug}"`)
  }

  outro(`${pc.green("✓")} Tenant "${slug}" deleted. Slug is now available.`)
}
