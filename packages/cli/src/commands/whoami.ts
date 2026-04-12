import { Command } from "commander"
import pc from "picocolors"
import { getCurrentSession } from "../lib/auth.js"
import { getAuthedSupabase } from "../lib/supabase-client.js"

export const whoamiCommand = new Command("whoami")
  .description("Print the current login and linked tenant")
  .option("-f, --format <format>", "Output format: text or json", "text")
  .action(async (opts: { format: string }) => {
    const session = await getCurrentSession()

    if (!session) {
      const tokenSet = Boolean(process.env.HELPBASE_TOKEN)
      if (opts.format === "json") {
        console.log(
          JSON.stringify({
            loggedIn: false,
            ...(tokenSet ? { error: "HELPBASE_TOKEN is invalid or expired" } : {}),
          }),
        )
        process.exit(1)
      }
      if (tokenSet) {
        console.log(
          `${pc.dim("›")} HELPBASE_TOKEN is set but invalid or expired.\n` +
          `  Re-issue the token and try again.`,
        )
      } else {
        console.log(
          `${pc.dim("›")} Not logged in.\n` +
          `  Run ${pc.cyan("helpbase login")} to authenticate.`,
        )
      }
      process.exit(1)
    }

    const source = process.env.HELPBASE_TOKEN ? "HELPBASE_TOKEN" : "~/.helpbase/auth.json"

    // Best-effort tenant lookup — we don't fail whoami if this errors.
    let tenant: { slug: string; name: string } | null = null
    try {
      const client = await getAuthedSupabase(session)
      const { data } = await client
        .from("tenants")
        .select("slug, name")
        .eq("owner_id", session.userId)
        .eq("active", true)
        .single()
      if (data) tenant = data
    } catch {
      // ignore — tenant lookup is informational
    }

    if (opts.format === "json") {
      console.log(
        JSON.stringify({
          loggedIn: true,
          email: session.email,
          userId: session.userId,
          source,
          tenant,
        }, null, 2),
      )
      return
    }

    console.log()
    console.log(`  Email:  ${pc.cyan(session.email)}`)
    console.log(`  Source: ${pc.dim(source)}`)
    if (tenant) {
      console.log(`  Tenant: ${pc.cyan(`${tenant.slug}.helpbase.dev`)} ${pc.dim(`(${tenant.name})`)}`)
    } else {
      console.log(`  Tenant: ${pc.dim("none — run `helpbase deploy` to create one")}`)
    }
    console.log()
  })
