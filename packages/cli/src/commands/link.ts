import { Command } from "commander"
import { intro, outro, select, text, cancel, isCancel, note } from "@clack/prompts"
import { spinner } from "../lib/ui.js"
import pc from "picocolors"
import { getCurrentSession, isNonInteractive } from "../lib/auth.js"
import { getAuthedSupabase } from "../lib/supabase-client.js"
import {
  readProjectConfig,
  removeProjectConfig,
  writeProjectConfig,
} from "../lib/project-config.js"

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/
const RESERVED_SLUGS = new Set([
  "www", "app", "api", "admin", "dashboard", "docs", "help", "blog", "status", "mail",
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

    const client = await getAuthedSupabase(session)

    // Non-interactive path: --slug supplied.
    if (opts.slug) {
      await linkBySlug(client, opts.slug)
      outro(`Linked to ${pc.cyan(`${opts.slug}.helpbase.dev`)}`)
      return
    }

    if (isNonInteractive()) {
      cancel("Non-interactive mode requires --slug <name>.")
      process.exit(1)
    }

    const s = spinner()
    s.start("Loading your tenants...")
    const { data: tenants, error } = await client
      .from("tenants")
      .select("id, slug, name")
      .eq("owner_id", session.userId)
      .eq("active", true)
      .order("created_at", { ascending: false })
    s.stop(
      error
        ? "Failed to load tenants"
        : `Found ${tenants?.length ?? 0} tenant(s)`,
    )

    if (error) {
      cancel(`Failed to load tenants: ${error.message}`)
      process.exit(1)
    }

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
      const created = await createTenant(client, session.userId, slug)
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

async function linkBySlug(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  slug: string,
): Promise<void> {
  const { data: tenant, error } = await client
    .from("tenants")
    .select("id, slug")
    .eq("slug", slug)
    .eq("active", true)
    .single()

  if (error || !tenant) {
    cancel(
      `Tenant "${slug}" not found or you don't have access.\n` +
      `  Run ${pc.cyan("helpbase link")} without --slug to see your tenants.`,
    )
    process.exit(1)
  }

  writeProjectConfig({ tenantId: tenant.id, slug: tenant.slug })
}

async function createTenant(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  userId: string,
  slug: string,
): Promise<{ id: string; slug: string }> {
  const { data: taken } = await client
    .from("tenants")
    .select("slug")
    .eq("slug", slug)
    .single()

  if (taken) {
    cancel(`Subdomain "${slug}" is already taken. Try another.`)
    process.exit(1)
  }

  const { data, error } = await client
    .from("tenants")
    .insert({ slug, owner_id: userId, name: slug })
    .select("id, slug")
    .single()

  if (error || !data) {
    const msg = error?.message ?? "Unknown error"
    if (msg.includes("duplicate") || msg.includes("unique")) {
      cancel(`Subdomain "${slug}" was just taken. Try another.`)
    } else {
      cancel(`Failed to create tenant: ${msg}`)
    }
    process.exit(1)
  }

  return data
}
