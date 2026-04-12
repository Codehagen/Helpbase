import { Command } from "commander"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import pc from "picocolors"
import { getCurrentSession } from "../lib/auth.js"
import { readProjectConfig } from "../lib/project-config.js"
import { readConfig } from "../lib/config.js"

/**
 * `helpbase doctor` — one-shot diagnostic. Dumps everything a user or
 * maintainer would want to know when something misbehaves, without
 * leaking secrets.
 */

interface Check {
  label: string
  value: string
  status: "ok" | "warn" | "info"
}

export const doctorCommand = new Command("doctor")
  .description("Print diagnostic info about your helpbase install and project")
  .option("-f, --format <format>", "Output format: text or json", "text")
  .action(async (opts: { format: string }) => {
    const checks = await collectChecks()

    if (opts.format === "json") {
      console.log(JSON.stringify(checks, null, 2))
      return
    }

    console.log()
    console.log(pc.bold("helpbase doctor"))
    console.log(pc.dim("─".repeat(60)))
    const labelWidth = Math.max(...checks.map((c) => c.label.length))
    for (const c of checks) {
      const icon =
        c.status === "ok"
          ? pc.green("✓")
          : c.status === "warn"
            ? pc.yellow("⚠")
            : pc.dim("›")
      console.log(`  ${icon} ${c.label.padEnd(labelWidth)}  ${c.value}`)
    }
    console.log()
    console.log(
      pc.dim(
        "If something looks wrong, share this output when reporting the issue.\n" +
        "  Redact ~/.helpbase/auth.json contents — that's where tokens live.",
      ),
    )
    console.log()
  })

async function collectChecks(): Promise<Check[]> {
  const checks: Check[] = []

  // Environment
  checks.push({ label: "helpbase CLI", value: cliVersion(), status: "info" })
  checks.push({ label: "Node.js", value: process.version, status: nodeOk() })
  checks.push({
    label: "Platform",
    value: `${process.platform} (${process.arch}), ${os.release()}`,
    status: "info",
  })

  // Auth state
  const session = await getCurrentSession().catch(() => null)
  const tokenSet = Boolean(process.env.HELPBASE_TOKEN)
  if (session) {
    checks.push({
      label: "Logged in",
      value: `${session.email || "(no email)"} ${pc.dim(tokenSet ? "(via HELPBASE_TOKEN)" : "(via ~/.helpbase/auth.json)")}`,
      status: "ok",
    })
  } else if (tokenSet) {
    checks.push({
      label: "Logged in",
      value: "HELPBASE_TOKEN is set but did not resolve to a session",
      status: "warn",
    })
  } else {
    checks.push({
      label: "Logged in",
      value: "no — run `helpbase login`",
      status: "info",
    })
  }

  // Project binding
  const linked = readProjectConfig()
  checks.push({
    label: "Project link",
    value: linked
      ? `${linked.slug}.helpbase.dev ${pc.dim(`(${path.relative(process.cwd(), ".helpbase/project.json") || ".helpbase/project.json"})`)}`
      : "not linked — run `helpbase link` or `helpbase deploy`",
    status: linked ? "ok" : "info",
  })

  // Project shape
  const hasContentDir = fs.existsSync(path.resolve("content"))
  checks.push({
    label: "content/",
    value: hasContentDir ? "found" : "missing — this isn't a helpbase project",
    status: hasContentDir ? "ok" : "warn",
  })

  const pkgPath = path.resolve("package.json")
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
        dependencies?: Record<string, string>
        devDependencies?: Record<string, string>
      }
      const nextDep = pkg.dependencies?.next ?? pkg.devDependencies?.next
      checks.push({
        label: "next dep",
        value: nextDep ? nextDep : "not found",
        status: nextDep ? "ok" : "warn",
      })
    } catch {
      checks.push({
        label: "package.json",
        value: "invalid JSON",
        status: "warn",
      })
    }
  } else {
    checks.push({
      label: "package.json",
      value: "missing",
      status: "warn",
    })
  }

  // Preferences
  const cfg = readConfig()
  checks.push({
    label: "telemetry",
    value: cfg.telemetry ?? "(unset — will prompt on next login)",
    status: "info",
  })
  if (cfg.anonId) {
    checks.push({
      label: "anon id",
      value: cfg.anonId,
      status: "info",
    })
  }

  return checks
}

function cliVersion(): string {
  try {
    const here = path.dirname(new URL(import.meta.url).pathname)
    for (const candidate of [
      path.join(here, "../package.json"),
      path.join(here, "../../package.json"),
    ]) {
      if (fs.existsSync(candidate)) {
        const pkg = JSON.parse(fs.readFileSync(candidate, "utf-8"))
        if (pkg.name === "helpbase" && typeof pkg.version === "string") {
          return pkg.version
        }
      }
    }
  } catch {
    // fall through
  }
  return "unknown"
}

function nodeOk(): "ok" | "warn" {
  const major = parseInt(process.version.replace(/^v/, "").split(".")[0] ?? "0", 10)
  return major >= 20 ? "ok" : "warn"
}
