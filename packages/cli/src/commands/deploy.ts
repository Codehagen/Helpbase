import { Command } from "commander"
import { intro, outro, text, note, cancel, isCancel, confirm, select } from "@clack/prompts"
import { spinner, nextSteps, summaryTable } from "../lib/ui.js"
import pc from "picocolors"
import fs from "node:fs"
import path from "node:path"
import matter from "gray-matter"
import { frontmatterSchema, categoryMetaSchema, type TenantChunk, type DeployReport } from "@workspace/shared/schemas"
import {
  checkSlugAvailability,
  createTenant as apiCreateTenant,
  deleteTenant as apiDeleteTenant,
  deployTenant as apiDeployTenant,
  getTenant as apiGetTenant,
  listMyTenants,
  rotateMcpToken as apiRotateMcpToken,
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
import { loadReservation } from "../lib/reservation.js"
import { clearCachedReservation } from "../lib/reservation-cache.js"

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/
// Kept in sync with RESERVED_SLUGS in link.ts and the subdomain-middleware allowlist.
// Any subdomain that collides with a marketing page, auth surface, or infra path.
const RESERVED_SLUGS = new Set([
  "www", "app", "api", "admin", "dashboard", "docs", "help", "blog", "status", "mail",
  "mcp", "deploy", "login", "signup", "signin", "auth", "billing", "support",
  "cdn", "static", "assets", "files", "media", "images", "img",
])

export const deployCommand = new Command("deploy")
  .description("Deploy your help center to helpbase cloud")
  .option("--slug <slug>", "Subdomain slug (e.g., my-product)")
  .option(
    "--rotate-mcp-token",
    "Rotate the tenant's MCP bearer token (invalidates all currently-active clients). Does not publish content.",
  )
  .option(
    "--delete <slug>",
    "Hard-delete a tenant and release its slug. Requires owner match. Cascades to articles, categories, chunks, deploys, and queries.",
  )
  .option("--yes", "Skip the confirmation prompt for --delete (required for non-interactive).")
  .addHelpText(
    "after",
    `
Examples:
  $ helpbase deploy
  $ helpbase deploy --slug acme-docs
  $ HELPBASE_TOKEN=xxx helpbase deploy --slug acme-docs        # CI / non-interactive
  $ helpbase deploy --rotate-mcp-token                         # rotate MCP token only
  $ helpbase deploy --delete acme-docs --yes                   # delete tenant + release slug
`,
  )
  .action(async (opts: { slug?: string; rotateMcpToken?: boolean; delete?: string; yes?: boolean }) => {
    intro(pc.bgCyan(pc.black(" helpbase deploy ")))

    // 0. --delete short-circuit: auth + delete + exit. Skips content checks
    //    and tenant-by-link resolution because the target tenant is supplied
    //    explicitly as --delete <slug>.
    if (opts.delete) {
      await handleDelete(opts.delete, { yes: opts.yes ?? false })
      return
    }

    // 1. Check we're in a helpbase project (skipped for --rotate-mcp-token since
    //    rotation only touches the tenant row; no content upload needed).
    const contentDir = path.resolve("content")
    if (!opts.rotateMcpToken && !fs.existsSync(contentDir)) {
      cancel(
        "No content/ directory found. Run this from a helpbase project root, or create one:\n" +
        pc.cyan("  npx create-helpbase")
      )
      process.exit(1)
    }

    // 2. Authenticate
    const session = await ensureAuthenticated()

    // 3. Get or create tenant
    //    Priority: .helpbase/project.json → owner lookup → create new.
    //    All tenant CRUD now goes through /api/v1/tenants/* — the CLI
    //    talks to the hosted API instead of Supabase directly. Better
    //    Auth session tokens are not Supabase JWTs, and the RLS *_own
    //    policies were dropped in the 2026-04-17 migration; ownership
    //    is enforced server-side.
    const linked = readProjectConfig()
    let existingTenant: { id: string; slug: string } | null = null
    // Flag so the post-deploy cleanup knows to invalidate the reservation
    // cache — once deploy_tenant flips deployed_at, the cached reservation
    // is stale and next whoami would still read the old row as "reserved".
    let usedReservation = false

    if (linked) {
      // apiGetTenant now throws on 403 (caller isn't the owner). Treat
      // that as "fix your link" the same as a missing/inactive row.
      const tenant = await apiGetTenant(session, linked.tenantId).catch(
        () => null,
      )
      if (tenant && tenant.active) {
        existingTenant = { id: tenant.id, slug: tenant.slug }
      } else {
        cancel(
          `Linked tenant "${linked.slug}" not found, inactive, or not owned by you.\n` +
          `  Run ${pc.cyan("helpbase link --remove")} then ${pc.cyan("helpbase link")} to fix.`,
        )
        process.exit(1)
      }
    } else {
      const tenants = await listMyTenants(session)
      // Reservation-first path: if the user has no deployed tenants and
      // didn't pass an explicit --slug, use the auto-provisioned reservation
      // (minted at login). Skips the interactive slug prompt entirely for
      // the common first-deploy happy path — matches the DX review's
      // "TTHW drops from 3-4 min to 90s" target. --slug override still
      // creates a new tenant (user intentionally chose a custom slug).
      if (tenants.length === 0 && !opts.slug) {
        const reservation = await loadReservation(session).catch(() => null)
        if (reservation) {
          existingTenant = { id: reservation.tenantId, slug: reservation.slug }
          usedReservation = true
        }
      }
      if (existingTenant) {
        // Already resolved via reservation — skip the picker/disambiguator
        // logic below.
      } else if (tenants.length === 0) {
        existingTenant = null
      } else if (tenants.length === 1) {
        const only = tenants[0]!
        existingTenant = { id: only.id, slug: only.slug }
      } else if (opts.slug) {
        // Multi-tenant + explicit --slug: honor the choice if it matches
        // one the user owns; otherwise treat it as "create a new tenant
        // with this slug" downstream (which will 409 if taken).
        const match = tenants.find((t) => t.slug === opts.slug)
        existingTenant = match ? { id: match.id, slug: match.slug } : null
      } else if (isNonInteractive()) {
        cancel(
          `You own ${tenants.length} tenants. Pass ${pc.cyan("--slug <name>")} ` +
          `to pick one in non-interactive mode.`,
        )
        process.exit(1)
      } else {
        // Interactive disambiguation — tenants[0] was non-deterministic.
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
        if (pickedValue === "__new__") {
          existingTenant = null
        } else {
          const picked = tenants.find((t) => t.id === pickedValue)!
          existingTenant = { id: picked.id, slug: picked.slug }
        }
      }
    }

    let tenantId: string
    let tenantSlug: string

    if (existingTenant) {
      tenantId = existingTenant.id
      tenantSlug = existingTenant.slug
      const tag = linked
        ? "(linked)"
        : usedReservation
          ? "(reserved at login)"
          : ""
      note(
        tag
          ? `Deploying to ${pc.cyan(`${tenantSlug}.helpbase.dev`)} ${pc.dim(tag)}`
          : `Deploying to ${pc.cyan(`${tenantSlug}.helpbase.dev`)}`,
        "Tenant",
      )
      // Backfill the project config for owner-lookup users so their next
      // deploy is deterministic and commitable.
      if (!linked) {
        writeProjectConfig({ tenantId, slug: tenantSlug })
      }
    } else {
      // First deploy: create tenant
      let slug = opts.slug

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

      // Check availability
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

      tenantId = newTenant.id
      tenantSlug = newTenant.slug
      writeProjectConfig({ tenantId, slug: tenantSlug })
      note(
        `Created ${pc.cyan(`${tenantSlug}.helpbase.dev`)}\n` +
        `Wrote ${pc.dim(".helpbase/project.json")} — commit it so teammates deploy to the same tenant.`,
        "New help center",
      )
    }

    // 3.5. Handle --rotate-mcp-token early-exit: skip content read/upload,
    //      mint a new public token, print it, and exit.
    if (opts.rotateMcpToken) {
      const rotateSpinner = spinner()
      rotateSpinner.start("Rotating MCP token...")
      let newToken: string
      try {
        newToken = await apiRotateMcpToken(session, tenantId)
      } catch (err) {
        rotateSpinner.stop("Rotation failed")
        cancel(`Failed to rotate token: ${err instanceof Error ? err.message : String(err)}`)
        process.exit(1)
      }
      rotateSpinner.stop(`Rotated MCP token for ${tenantSlug}`)
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
      return
    }

    // 4. Read and validate content
    const s = spinner()
    s.start("Reading content...")

    const categories: Array<{
      slug: string
      title: string
      description: string
      icon: string
      order: number
    }> = []
    const articles: Array<{
      slug: string
      category: string
      title: string
      description: string
      content: string
      frontmatter: Record<string, unknown>
      order: number
      tags: string[]
      heroImage: string | null
      videoEmbed: string | null
      featured: boolean
      filePath: string
    }> = []
    const errors: string[] = []

    const categoryDirs = fs
      .readdirSync(contentDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())

    for (const dir of categoryDirs) {
      const categorySlug = dir.name
      const categoryPath = path.join(contentDir, categorySlug)

      // Read _category.json if it exists
      const metaPath = path.join(categoryPath, "_category.json")
      let meta = { title: categorySlug, description: "", icon: "file-text", order: 999 }
      if (fs.existsSync(metaPath)) {
        try {
          const raw = JSON.parse(fs.readFileSync(metaPath, "utf-8"))
          const parsed = categoryMetaSchema.safeParse(raw)
          if (parsed.success) meta = parsed.data
        } catch {
          errors.push(`${categorySlug}/_category.json: Invalid JSON`)
        }
      }

      categories.push({ slug: categorySlug, ...meta })

      // Read MDX files
      const files = fs
        .readdirSync(categoryPath)
        .filter((f) => f.endsWith(".mdx") || f.endsWith(".md"))

      for (const file of files) {
        const filePath = path.join(categoryPath, file)
        const raw = fs.readFileSync(filePath, "utf-8")
        const { data, content } = matter(raw)

        const parsed = frontmatterSchema.safeParse(data)
        if (!parsed.success) {
          errors.push(
            `${categorySlug}/${file}: ${parsed.error.issues.map((i) => i.message).join(", ")}`
          )
          continue
        }

        const articleSlug = file.replace(/\.mdx?$/, "")

        articles.push({
          slug: articleSlug,
          category: categorySlug,
          title: parsed.data.title,
          description: parsed.data.description,
          content,
          frontmatter: data as Record<string, unknown>,
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
        "\n\nFix these and run helpbase deploy again."
      )
      process.exit(1)
    }

    if (articles.length === 0) {
      cancel(
        "No articles found in content/.\n" +
        `Generate some: ${pc.cyan("helpbase generate --url <your-site>")}`
      )
      process.exit(1)
    }

    // 5. Compute chunks (CLI-side chunking for MCP search_docs).
    s.start("Chunking content for search...")
    const chunks: TenantChunk[] = []
    for (const a of articles) {
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
    s.stop(`Chunked into ${chunks.length} search chunks`)

    // 6. Atomic deploy via Supabase RPC — single transaction, no empty-page window.
    s.start("Publishing (atomic)...")
    const validationReport: DeployReport = {
      kept_count: articles.length,
      dropped_count: 0,
      dropped: [],
      ran_at: new Date().toISOString(),
    }
    let deployResult: Awaited<ReturnType<typeof apiDeployTenant>>
    try {
      deployResult = await apiDeployTenant(session, tenantId, {
        categories: categories.map((c) => ({
          slug: c.slug,
          title: c.title,
          description: c.description,
          icon: c.icon,
          order: c.order,
        })),
        articles: articles.map((a) => ({
          slug: a.slug,
          category: a.category,
          title: a.title,
          description: a.description,
          content: a.content,
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
      })
    } catch (err) {
      s.stop("Deploy failed")
      cancel(`Deploy error: ${err instanceof Error ? err.message : String(err)}`)
      process.exit(1)
    }
    s.stop(
      `Published ${deployResult.article_count} articles, ${deployResult.chunk_count} chunks ` +
      `(deploy ${deployResult.deploy_id.slice(0, 8)})`,
    )

    // Fetch the tenant's MCP token for the copy-paste config snippet.
    // Server-side revalidation runs inside /api/v1/tenants/:id/deploy, so
    // no second round-trip for cache invalidation is needed.
    const tenantAfter = await apiGetTenant(session, tenantId).catch(() => null)
    const mcpToken = tenantAfter?.mcp_public_token ?? ""

    // 9. Done. If we consumed a reservation to get here, the server just
    //    flipped deployed_at in deploy_tenant — invalidate the cache so
    //    `helpbase whoami` stops showing the tenant as "reserved".
    if (usedReservation) {
      clearCachedReservation()
    }
    const liveUrl = `https://${tenantSlug}.helpbase.dev`
    const mcpUrl = `https://${tenantSlug}.helpbase.dev/mcp`
    outro(`${pc.green("✓")} Deployed! Your help center is live.`)
    summaryTable([
      ["Tenant", `${tenantSlug}.helpbase.dev`],
      ["Articles", String(articles.length)],
      ["Chunks", String(chunks.length)],
      ["Categories", String(categories.length)],
      ["Live URL", liveUrl],
      ["MCP URL", mcpUrl],
    ])

    // MCP client config — paste into Claude Code, Cursor, or Claude Desktop.
    if (mcpToken) {
      const mcpConfig = JSON.stringify(
        {
          mcpServers: {
            [tenantSlug]: {
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
      commands: ["helpbase open", "helpbase deploy"],
      urls: [
        { label: "docs:", url: liveUrl },
        { label: "mcp:", url: mcpUrl },
      ],
    })
  })

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

  // Browser device-flow is the only supported interactive login path.
  // Don't inline it here — `helpbase login` owns the full UX (progressive
  // spinner hints, URL-paste fallback, retries). Telling the user to run
  // that command keeps deploy focused on deploying.
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
  // Validate slug shape so we don't ship a typo'd curl to Supabase.
  if (!SLUG_REGEX.test(slug)) {
    cancel(`Invalid slug: "${slug}". Slugs are lowercase letters, numbers, and hyphens.`)
    process.exit(1)
  }

  const session = await ensureAuthenticated()

  // Resolve the tenant row among the user's own tenants. Ownership
  // filter is implicit: listMyTenants only returns rows the caller owns.
  const tenants = await listMyTenants(session)
  const tenant = tenants.find((t) => t.slug === slug) ?? null
  if (!tenant) {
    // Either the slug doesn't exist, or it exists but the caller doesn't
    // own it. Either way we refuse — the server-side DELETE endpoint
    // would 403 anyway, but failing here gives a cleaner CLI message.
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

  // Confirm — unless --yes or non-interactive (in which case --yes is required
  // as a failsafe against accidental CI deletions).
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

  // Clean up local project.json if it pointed at this tenant.
  const linked = readProjectConfig()
  if (linked && linked.tenantId === tenant.id) {
    removeProjectConfig()
    s.stop(`Deleted "${slug}" and removed local .helpbase/project.json`)
  } else {
    s.stop(`Deleted "${slug}"`)
  }

  outro(`${pc.green("✓")} Tenant "${slug}" deleted. Slug is now available.`)
}
