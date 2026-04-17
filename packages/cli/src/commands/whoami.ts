import { Command } from "commander"
import pc from "picocolors"
import { getCurrentSession } from "../lib/auth.js"
import { getAuthedSupabase } from "../lib/supabase-client.js"
import { fetchUsageToday, isByokMode } from "@workspace/shared/llm"
import { humanTokens, humanUntil } from "@workspace/shared/llm-errors"
import { BYOK_DOCS_URL } from "@workspace/shared/llm-wire"
import type { UsageTodayResponse } from "@workspace/shared/llm-wire"

export const whoamiCommand = new Command("whoami")
  .description("Print the current login, linked tenant, and today's usage")
  .option("-f, --format <format>", "Output format: text or json", "text")
  .action(async (opts: { format: string }) => {
    const session = await getCurrentSession()
    const byok = isByokMode()

    if (!session) {
      const tokenSet = Boolean(process.env.HELPBASE_TOKEN)
      if (opts.format === "json") {
        console.log(
          JSON.stringify({
            loggedIn: false,
            byok,
            ...(tokenSet ? { error: "HELPBASE_TOKEN is invalid or expired" } : {}),
          }),
        )
        process.exit(1)
      }
      if (tokenSet) {
        console.log(
          `${pc.red("✗")} ${pc.cyan("HELPBASE_TOKEN")} is set but invalid or expired.\n` +
          `  Re-issue the token and try again.`,
        )
      } else if (byok) {
        console.log(
          `${pc.yellow("●")} Not logged in, but ${pc.cyan("AI_GATEWAY_API_KEY")} is set — ` +
          `BYOK mode active. All LLM calls go direct to Vercel AI Gateway on your key.`,
        )
      } else {
        console.log(
          `${pc.red("✗")} Not signed in. Run ${pc.cyan("helpbase login")} to get started ` +
          `(free, no card), or set ${pc.cyan("HELPBASE_TOKEN")} for CI.`,
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

    // Best-effort usage lookup. Fails closed silently: if the hosted API is
    // unreachable, we don't want whoami to error — just omit the usage line.
    let usage: UsageTodayResponse | null = null
    if (!byok) {
      try {
        usage = await fetchUsageToday(session.accessToken)
      } catch {
        // network blip or transient 5xx — skip usage display
      }
    }

    if (opts.format === "json") {
      console.log(
        JSON.stringify(
          {
            loggedIn: true,
            email: session.email,
            userId: session.userId,
            source,
            tenant,
            byok,
            usage: usage?.quota ?? null,
          },
          null,
          2,
        ),
      )
      return
    }

    console.log()
    console.log(`  ${pc.green("✓")} ${pc.cyan(session.email)}`)

    if (byok) {
      console.log(
        `    ${pc.yellow("BYOK mode:")} ${pc.cyan("AI_GATEWAY_API_KEY")} is set — calls bypass helpbase (no quota applied).`,
      )
    } else if (usage) {
      const { usedToday, dailyLimit, resetAt } = usage.quota
      const pct = Math.round((usedToday / dailyLimit) * 100)
      const reset = humanUntil(resetAt)
      console.log(
        `    used today: ${pc.bold(humanTokens(usedToday))} / ${humanTokens(dailyLimit)} tokens ` +
        `(${pct}%) ${pc.dim(`— resets in ${reset}`)}`,
      )
      console.log(
        `    ${pc.dim("escape hatch:")} export ${pc.cyan("AI_GATEWAY_API_KEY")}=... for unlimited (see ${BYOK_DOCS_URL})`,
      )
    } else {
      console.log(`    ${pc.dim("usage: could not fetch (network blip — try again in a moment)")}`)
    }

    console.log(`    source: ${pc.dim(source)}`)
    if (tenant) {
      console.log(`    tenant: ${pc.cyan(`${tenant.slug}.helpbase.dev`)} ${pc.dim(`(${tenant.name})`)}`)
    } else {
      console.log(`    tenant: ${pc.dim("none — run `helpbase deploy` to create one")}`)
    }
    console.log()
  })
