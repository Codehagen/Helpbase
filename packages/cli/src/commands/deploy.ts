import { Command } from "commander"
import { intro, outro, text, spinner, note, cancel, isCancel } from "@clack/prompts"
import pc from "picocolors"
import fs from "node:fs"
import path from "node:path"
import matter from "gray-matter"
import { frontmatterSchema, categoryMetaSchema } from "@workspace/shared/schemas"
import { getAuthedSupabase } from "../lib/supabase-client.js"
import {
  getCurrentSession,
  isNonInteractive,
  sendLoginCode,
  verifyLoginCode,
  type AuthSession,
} from "../lib/auth.js"
import { readProjectConfig, writeProjectConfig } from "../lib/project-config.js"
import { HelpbaseError, formatError } from "../lib/errors.js"

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/
const RESERVED_SLUGS = new Set([
  "www", "app", "api", "admin", "dashboard", "docs", "help", "blog", "status", "mail",
])

export const deployCommand = new Command("deploy")
  .description("Deploy your help center to helpbase cloud")
  .option("--slug <slug>", "Subdomain slug (e.g., my-product)")
  .addHelpText(
    "after",
    `
Examples:
  $ helpbase deploy
  $ helpbase deploy --slug acme-docs
  $ HELPBASE_TOKEN=xxx helpbase deploy --slug acme-docs        # CI / non-interactive
`,
  )
  .action(async (opts: { slug?: string }) => {
    intro(pc.bgCyan(pc.black(" helpbase deploy ")))

    // 1. Check we're in a helpbase project
    const contentDir = path.resolve("content")
    if (!fs.existsSync(contentDir)) {
      cancel(
        "No content/ directory found. Run this from a helpbase project root, or create one:\n" +
        pc.cyan("  npx create-helpbase")
      )
      process.exit(1)
    }

    // 2. Authenticate
    const session = await ensureAuthenticated()
    const client = await getAuthedSupabase(session)

    // 3. Get or create tenant
    //    Priority: .helpbase/project.json → owner lookup → create new
    const linked = readProjectConfig()
    let existingTenant: { id: string; slug: string } | null = null

    if (linked) {
      const { data } = await client
        .from("tenants")
        .select("id, slug")
        .eq("id", linked.tenantId)
        .eq("active", true)
        .single()
      if (data) {
        existingTenant = data
      } else {
        cancel(
          `Linked tenant "${linked.slug}" not found or inactive.\n` +
          `  Run ${pc.cyan("helpbase link --remove")} then ${pc.cyan("helpbase link")} to fix.`,
        )
        process.exit(1)
      }
    } else {
      const { data } = await client
        .from("tenants")
        .select("id, slug")
        .eq("owner_id", session.userId)
        .eq("active", true)
        .single()
      existingTenant = data ?? null
    }

    let tenantId: string
    let tenantSlug: string

    if (existingTenant) {
      tenantId = existingTenant.id
      tenantSlug = existingTenant.slug
      note(
        linked
          ? `Deploying to ${pc.cyan(`${tenantSlug}.helpbase.dev`)} ${pc.dim("(linked)")}`
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
      const { data: taken } = await client
        .from("tenants")
        .select("slug")
        .eq("slug", slug)
        .single()

      if (taken) {
        cancel(`Subdomain "${slug}" is already taken. Try another with --slug <name>`)
        process.exit(1)
      }

      const { data: newTenant, error: createError } = await client
        .from("tenants")
        .insert({
          slug,
          owner_id: session.userId,
          name: slug,
        })
        .select()
        .single()

      if (createError || !newTenant) {
        // Handle slug collision from concurrent creates (DB unique constraint)
        const msg = createError?.message ?? "Unknown error"
        if (msg.includes("duplicate") || msg.includes("unique")) {
          cancel(`Subdomain "${slug}" was just taken. Try another with --slug <name>`)
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

    // 5. Upload categories
    s.start("Uploading categories...")

    // Delete existing categories for this tenant, then re-insert
    await client.from("tenant_categories").delete().eq("tenant_id", tenantId)

    const { error: catError } = await client.from("tenant_categories").insert(
      categories.map((c) => ({
        tenant_id: tenantId,
        slug: c.slug,
        title: c.title,
        description: c.description,
        icon: c.icon,
        order: c.order,
      }))
    )

    if (catError) {
      s.stop("Failed to upload categories")
      cancel(`Category upload error: ${catError.message}`)
      process.exit(1)
    }

    s.stop(`Uploaded ${categories.length} categories`)

    // 6. Upload articles
    s.start("Uploading articles...")

    // Delete existing articles, then re-insert (full sync)
    await client.from("tenant_articles").delete().eq("tenant_id", tenantId)

    const { error: artError } = await client.from("tenant_articles").insert(
      articles.map((a) => ({
        tenant_id: tenantId,
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
      }))
    )

    if (artError) {
      s.stop("Failed to upload articles")
      cancel(`Article upload error: ${artError.message}`)
      process.exit(1)
    }

    s.stop(`Uploaded ${articles.length} articles`)

    // 7. Done
    outro(
      `${pc.green("✓")} Deployed! Your help center is live:\n` +
      `  ${pc.cyan(`https://${tenantSlug}.helpbase.dev`)}\n\n` +
      `  Open it:   ${pc.dim("helpbase open")}\n` +
      `  Redeploy:  ${pc.dim("helpbase deploy")}`
    )
  })

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

  note("First time? Let's get you set up.", "Authentication")

  const email = await text({
    message: "Enter your email:",
    placeholder: "you@company.com",
    validate: (v) => {
      if (!v.includes("@")) return "Please enter a valid email"
      return undefined
    },
  })
  if (isCancel(email)) {
    cancel("Cancelled.")
    process.exit(0)
  }

  const s = spinner()
  s.start("Sending magic link...")
  try {
    await sendLoginCode(email as string)
    s.stop("Magic link sent!")
  } catch (err) {
    s.stop("Failed to send magic link")
    if (err instanceof HelpbaseError) {
      cancel(formatError(err).trimEnd())
    } else {
      cancel(`Authentication error: ${String(err)}`)
    }
    process.exit(1)
  }

  const code = await text({
    message: "Enter the 6-digit code from your email:",
    placeholder: "123456",
    validate: (v) => {
      if (!/^\d{6}$/.test(v)) return "Enter the 6-digit code"
      return undefined
    },
  })
  if (isCancel(code)) {
    cancel("Cancelled.")
    process.exit(0)
  }

  try {
    const session = await verifyLoginCode(email as string, code as string)
    note(`Authenticated as ${pc.cyan(session.email)}`, "Success")
    return session
  } catch (err) {
    if (err instanceof HelpbaseError) {
      cancel(formatError(err).trimEnd())
    } else {
      cancel(`Verification failed: ${String(err)}`)
    }
    process.exit(1)
  }
}
