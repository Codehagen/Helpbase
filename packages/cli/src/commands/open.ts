import { Command } from "commander"
import { execSync } from "node:child_process"
import pc from "picocolors"
import { readProjectConfig } from "../lib/project-config.js"
import { getCurrentSession } from "../lib/auth.js"
import { getAuthedSupabase } from "../lib/supabase-client.js"

export const openCommand = new Command("open")
  .description("Open this project's help center in the default browser")
  .option("--print", "Print the URL instead of opening it (useful for CI / scripts)")
  .action(async (opts: { print?: boolean }) => {
    const slug = await resolveSlug()
    if (!slug) {
      console.error(
        `${pc.red("✖")} This project isn't linked to a tenant yet.\n` +
        `  Run ${pc.cyan("helpbase link")} or ${pc.cyan("helpbase deploy")} first.\n`,
      )
      process.exit(1)
    }

    const url = `https://${slug}.helpbase.dev`

    if (opts.print) {
      console.log(url)
      return
    }

    const cmd = platformOpener(url)
    if (!cmd) {
      console.log(url)
      console.log(
        `${pc.dim("›")} Unrecognized platform; printed the URL instead.`,
      )
      return
    }

    try {
      execSync(cmd, { stdio: "ignore" })
      console.log(`${pc.green("✓")} Opened ${pc.cyan(url)}`)
    } catch {
      console.log(url)
      console.log(`${pc.dim("›")} Couldn't launch browser; printed the URL instead.`)
    }
  })

async function resolveSlug(): Promise<string | null> {
  const config = readProjectConfig()
  if (config) return config.slug

  // Fallback: look up the user's active tenant if they're logged in.
  const session = await getCurrentSession()
  if (!session) return null

  try {
    const client = await getAuthedSupabase(session)
    const { data } = await client
      .from("tenants")
      .select("slug")
      .eq("owner_id", session.userId)
      .eq("active", true)
      .single()
    return data?.slug ?? null
  } catch {
    return null
  }
}

function platformOpener(url: string): string | null {
  // URL is already slug-derived (a-z0-9-) so shell escaping isn't an issue,
  // but quote defensively anyway.
  const quoted = `"${url.replace(/"/g, '\\"')}"`
  switch (process.platform) {
    case "darwin":
      return `open ${quoted}`
    case "win32":
      return `start "" ${quoted}`
    case "linux":
      return `xdg-open ${quoted}`
    default:
      return null
  }
}
