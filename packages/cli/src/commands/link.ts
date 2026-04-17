import { Command } from "commander"
import { intro, outro, select, text, cancel, isCancel, note } from "@clack/prompts"
import { spinner } from "../lib/ui.js"
import pc from "picocolors"
import { getCurrentSession, isNonInteractive } from "../lib/auth.js"
import {
  checkSlugAvailability,
  createTenant as apiCreateTenant,
  getTenant as apiGetTenant,
  listMyTenants,
} from "../lib/tenants-client.js"
import type { AuthSession } from "../lib/auth.js"
import {
  readProjectConfig,
  removeProjectConfig,
  writeProjectConfig,
} from "../lib/project-config.js"

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/
// Kept in sync with RESERVED_SLUGS in deploy.ts and the subdomain-middleware allowlist.
const RESERVED_SLUGS = new Set([
  "www", "app", "api", "admin", "dashboard", "docs", "help", "blog", "status", "mail",
  "mcp", "deploy", "login", "signup", "signin", "auth", "billing", "support",
  "cdn", "static", "assets", "files", "media", "images", "img",
])

export const linkCommand = new Command("link")
  .description("Link this project to a helpbase cloud tenant")
  .option("--slug <slug>", "Link directly to a tenant by slug (skips the picker)")
  .option("--remove", "Remove the existing .helpbase/project.json binding")
  .action(async (opts: { slug?: string; remove?: boolean }) => {
    if (opts.remove) {
      const removed = removeProjectConfig()
      console.log(
        removed
          ? `${pc.green("✓")} Unlinked — removed .helpbase/project.json`
          : `${pc.dim("›")} No link to remove.`,
      )
      return
    }

    const existing = readProjectConfig()
    if (existing) {
      console.log(
        `${pc.dim("›")} This project is already linked to ${pc.cyan(`${existing.slug}.helpbase.dev`)}.\n` +
        `  Run ${pc.cyan("helpbase link --remove")} first if you want to relink.`,
      )
      return
    }

    const session = await getCurrentSession()
    if (!session) {
      console.error(
        `${pc.red("✖")} Not logged in.\n` +
        `  Run ${pc.cyan("helpbase login")} first, or set ${pc.cyan("HELPBASE_TOKEN")} for CI.\n`,
      )
      process.exit(1)
    }

    intro(pc.bgCyan(pc.black(" helpbase link ")))

    // Non-interactive path: --slug supplied.
    if (opts.slug) {
      await linkBySlug(opts.slug, session)
      outro(`Linked to ${pc.cyan(`${opts.slug}.helpbase.dev`)}`)
      return
    }

    if (isNonInteractive()) {
      cancel("Non-interactive mode requires --slug <name>.")
      process.exit(1)
    }

    const s = spinner()
    s.start("Loading your tenants...")
    let tenants: Awaited<ReturnType<typeof listMyTenants>>
    try {
      tenants = await listMyTenants(session)
    } catch (err) {
      s.stop("Failed to load tenants")
      cancel(`Failed to load tenants: ${err instanceof Error ? err.message : String(err)}`)
      process.exit(1)
    }
    s.stop(`Found ${tenants.length} tenant(s)`)

    type Choice = string
    const CREATE_NEW: Choice = "__new__"
    const options: { value: Choice; label: string; hint?: string }[] = [
      ...(tenants ?? []).map((t) => ({
        value: t.id as string,
        label: `${t.slug}.helpbase.dev`,
        hint: t.name ?? undefined,
      })),
      { value: CREATE_NEW, label: pc.cyan("+ Create a new tenant") },
    ]

    const picked = await select({
      message: "Which tenant should this project deploy to?",
      options,
    })
    if (isCancel(picked)) {
      cancel("Cancelled.")
      process.exit(0)
    }

    if (picked === CREATE_NEW) {
      const slug = await promptForNewSlug()
      const created = await createTenant(session, slug)
      writeProjectConfig({ tenantId: created.id, slug: created.slug })
      outro(
        `${pc.green("✓")} Created and linked ${pc.cyan(`${created.slug}.helpbase.dev`)}\n` +
        `  Committed: ${pc.dim(".helpbase/project.json")}`,
      )
      return
    }

    const tenant = (tenants ?? []).find((t) => t.id === picked)
    if (!tenant) {
      cancel("Selected tenant not found. This should not happen.")
      process.exit(1)
    }

    writeProjectConfig({ tenantId: tenant.id, slug: tenant.slug })
    outro(
      `${pc.green("✓")} Linked to ${pc.cyan(`${tenant.slug}.helpbase.dev`)}\n` +
      `  Committed: ${pc.dim(".helpbase/project.json")}`,
    )
  })

async function promptForNewSlug(): Promise<string> {
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
  return input as string
}

async function linkBySlug(slug: string, session: AuthSession): Promise<void> {
  const availability = await checkSlugAvailability(slug)
  if (availability.available) {
    cancel(
      `Tenant "${slug}" not found.\n` +
      `  Run ${pc.cyan("helpbase link")} without --slug to see your tenants, ` +
      `or ${pc.cyan(`helpbase deploy --slug ${slug}`)} to create one.`,
    )
    process.exit(1)
  }
  if (!availability.id) {
    cancel("Availability check did not return an id.")
    process.exit(1)
  }
  // checkSlugAvailability hits a public endpoint — "taken" only proves
  // the slug exists, not that this user owns it. Confirm ownership before
  // writing .helpbase/project.json, otherwise the user gets a misleading
  // 403 on the next `helpbase deploy`/`open`/`whoami`.
  //
  // getTenant returns null on 404 (gone between the availability check
  // and now — rare, but possible) and throws on 403 (caller isn't the
  // owner). Treat both as "you can't link this slug" but print the
  // right copy for each.
  let owned: Awaited<ReturnType<typeof apiGetTenant>>
  try {
    owned = await apiGetTenant(session, availability.id)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/\(403\)/.test(msg)) {
      cancel(
        `You don't own "${slug}.helpbase.dev".\n` +
        `  Pick a different subdomain, or run ${pc.cyan("helpbase link")} to see what you own.`,
      )
      process.exit(1)
    }
    cancel(`Could not verify tenant ownership: ${msg}`)
    process.exit(1)
  }
  if (!owned) {
    cancel(`Tenant "${slug}" disappeared before linking. Try again.`)
    process.exit(1)
  }
  writeProjectConfig({ tenantId: availability.id, slug: availability.slug ?? slug })
}

async function createTenant(
  session: AuthSession,
  slug: string,
): Promise<{ id: string; slug: string }> {
  try {
    const created = await apiCreateTenant(session, slug)
    return { id: created.id, slug: created.slug }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/slug_taken|slug_reserved/.test(msg)) {
      cancel(`Subdomain "${slug}" is unavailable. Try another.`)
    } else {
      cancel(`Failed to create tenant: ${msg}`)
    }
    process.exit(1)
  }
}
