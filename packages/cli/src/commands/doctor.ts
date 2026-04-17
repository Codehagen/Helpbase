import { Command } from "commander"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import pc from "picocolors"
import { getCurrentSession } from "../lib/auth.js"
import { readProjectConfig } from "../lib/project-config.js"
import { readConfig } from "../lib/config.js"

/**
 * `helpbase doctor` — one-shot diagnostic.
 *
 * Each check lives in a category (environment / project / account / network)
 * so users can scan by concern. Failing checks carry a `fix` command the user
 * can copy-paste. Network checks run with a 2s timeout and downgrade to
 * warnings instead of errors — flaky wifi shouldn't look like broken code.
 *
 * Stays scoped to Phase 1: Node version + project linked + auth + content
 * shape + telemetry. Supabase reachability, package-manager versions, and
 * Next version checks are reserved for Phase 2 once the category shape has
 * proven itself in the wild.
 */

type Category = "environment" | "project" | "account" | "network"
type Severity = "ok" | "warn" | "error" | "info"

interface Check {
  label: string
  category: Category
  severity: Severity
  value: string
  /** Exact shell command or action the user can copy-paste to fix the issue. */
  fix?: string
}

interface CheckOptions {
  /** Skip network category checks. For corp nets, captive portals, flights. */
  offline: boolean
}

export const doctorCommand = new Command("doctor")
  .description("Print diagnostic info about your helpbase install and project")
  .option("-f, --format <format>", "Output format: text or json", "text")
  .option("--offline", "Skip network checks (useful on planes and behind corp proxies)")
  .action(async (opts: { format: string; offline?: boolean }) => {
    const checks = await collectChecks({ offline: Boolean(opts.offline) })

    if (opts.format === "json") {
      console.log(JSON.stringify(checks, null, 2))
      return
    }

    renderText(checks)
  })

function renderText(checks: Check[]): void {
  console.log()
  console.log(pc.bold("helpbase doctor"))
  console.log(pc.dim("─".repeat(60)))

  const categoryOrder: Category[] = ["environment", "project", "account", "network"]
  const byCategory = new Map<Category, Check[]>()
  for (const c of checks) {
    const list = byCategory.get(c.category) ?? []
    list.push(c)
    byCategory.set(c.category, list)
  }

  for (const cat of categoryOrder) {
    const list = byCategory.get(cat)
    if (!list?.length) continue

    console.log()
    console.log(`  ${pc.dim(categoryLabel(cat))}`)
    const labelWidth = Math.max(...list.map((c) => c.label.length))
    for (const c of list) {
      const icon = severityIcon(c.severity)
      console.log(`  ${icon} ${c.label.padEnd(labelWidth)}  ${c.value}`)
      if (c.fix && c.severity !== "ok") {
        console.log(`      ${pc.dim("fix:")} ${pc.cyan(c.fix)}`)
      }
    }
  }

  console.log()
  console.log(
    pc.dim(
      "If something looks wrong, share this output when reporting the issue.\n" +
      "  Redact ~/.helpbase/auth.json contents — that's where tokens live.",
    ),
  )
  console.log()
}

function severityIcon(s: Severity): string {
  switch (s) {
    case "ok":
      return pc.green("✓")
    case "warn":
      return pc.yellow("⚠")
    case "error":
      return pc.red("✖")
    case "info":
      return pc.dim("›")
  }
}

function categoryLabel(c: Category): string {
  return c === "environment"
    ? "Environment"
    : c === "project"
      ? "Project"
      : c === "account"
        ? "Account"
        : "Network"
}

async function collectChecks(opts: CheckOptions): Promise<Check[]> {
  const checks: Check[] = []

  // ── Environment ─────────────────────────────────────────────────
  checks.push({
    label: "helpbase CLI",
    category: "environment",
    severity: "info",
    value: cliVersion(),
  })
  const nodeSeverity = nodeOk() ? "ok" : "warn"
  checks.push({
    label: "Node.js",
    category: "environment",
    severity: nodeSeverity,
    value: process.version,
    fix: nodeSeverity === "warn" ? "Install Node 20+ from https://nodejs.org" : undefined,
  })
  checks.push({
    label: "Platform",
    category: "environment",
    severity: "info",
    value: `${process.platform} (${process.arch}), ${os.release()}`,
  })

  // ── Account ─────────────────────────────────────────────────────
  const session = await getCurrentSession().catch(() => null)
  const tokenSet = Boolean(process.env.HELPBASE_TOKEN)
  if (session) {
    checks.push({
      label: "Logged in",
      category: "account",
      severity: "ok",
      value: `${session.email || "(no email)"} ${pc.dim(tokenSet ? "(via HELPBASE_TOKEN)" : "(via ~/.helpbase/auth.json)")}`,
    })
  } else if (tokenSet) {
    checks.push({
      label: "Logged in",
      category: "account",
      severity: "warn",
      value: "HELPBASE_TOKEN is set but did not resolve to a session",
      fix: "Regenerate the token and re-export HELPBASE_TOKEN, or run `helpbase login` locally",
    })
  } else {
    checks.push({
      label: "Logged in",
      category: "account",
      severity: "info",
      value: "no (not logged in)",
      fix: "helpbase login",
    })
  }

  // ── Project ─────────────────────────────────────────────────────
  const linked = readProjectConfig()
  checks.push({
    label: "Project link",
    category: "project",
    severity: linked ? "ok" : "info",
    value: linked
      ? `${linked.slug}.helpbase.dev ${pc.dim(`(${path.relative(process.cwd(), ".helpbase/project.json") || ".helpbase/project.json"})`)}`
      : "not linked",
    fix: linked ? undefined : "helpbase link",
  })

  const hasContentDir = fs.existsSync(path.resolve("content"))
  checks.push({
    label: "content/",
    category: "project",
    severity: hasContentDir ? "ok" : "warn",
    value: hasContentDir ? "found" : "missing",
    fix: hasContentDir ? undefined : "mkdir content && helpbase new",
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
        category: "project",
        severity: nextDep ? "ok" : "warn",
        value: nextDep ?? "not found",
        fix: nextDep ? undefined : "pnpm add next",
      })
    } catch {
      checks.push({
        label: "package.json",
        category: "project",
        severity: "warn",
        value: "invalid JSON",
        fix: "Inspect package.json — something is malformed",
      })
    }
  } else {
    checks.push({
      label: "package.json",
      category: "project",
      severity: "warn",
      value: "missing",
      fix: "Run from a project root, or scaffold with `npx create-helpbase`",
    })
  }

  // ── Account preferences ────────────────────────────────────────
  const cfg = readConfig()
  checks.push({
    label: "telemetry",
    category: "account",
    severity: "info",
    value: cfg.telemetry ?? "(unset — will prompt on next login)",
  })
  if (cfg.anonId) {
    checks.push({
      label: "anon id",
      category: "account",
      severity: "info",
      value: cfg.anonId,
    })
  }

  // ── Network (opt-out via --offline) ─────────────────────────────
  if (!opts.offline) {
    checks.push(await checkApiReachable())
    checks.push(await checkLlmProxyReachable())
    if (session && !process.env.AI_GATEWAY_API_KEY) {
      checks.push(await checkUsageEndpoint(session.accessToken))
    }
  }

  return checks
}

/**
 * Soft reachability check: HEAD the marketing origin. Never fails the command.
 * If something is truly broken end-to-end, subsequent commands will surface
 * the specific error via HelpbaseError + formatError. This is a heads-up only.
 */
async function checkApiReachable(): Promise<Check> {
  const url = "https://helpbase.dev"
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 2000)
  try {
    const res = await fetch(url, { method: "HEAD", signal: controller.signal })
    if (res.ok) {
      return {
        label: "helpbase.dev",
        category: "network",
        severity: "ok",
        value: `reachable (${res.status})`,
      }
    }
    return {
      label: "helpbase.dev",
      category: "network",
      severity: "warn",
      value: `status ${res.status}`,
      fix: "Retry in a moment; or run `helpbase doctor --offline` to skip",
    }
  } catch (err) {
    const aborted = (err as { name?: string }).name === "AbortError"
    return {
      label: "helpbase.dev",
      category: "network",
      severity: "warn",
      value: aborted ? "timed out after 2s" : "unreachable",
      fix: "Check your connection, or run `helpbase doctor --offline`",
    }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * HEAD /api/v1/llm/generate-object. 405 is the "correct" response (we don't
 * accept HEAD on a POST-only route) — any 4xx/5xx other than 405 means
 * something is wrong with DNS, TLS, or routing, and subsequent `helpbase
 * generate` calls will fail. We surface it BEFORE generate fails.
 */
async function checkLlmProxyReachable(): Promise<Check> {
  const url = "https://helpbase.dev/api/v1/llm/generate-object"
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 2000)
  try {
    const res = await fetch(url, { method: "HEAD", signal: controller.signal })
    // 405 = Method Not Allowed (POST-only route). 404 = route not deployed yet.
    if (res.status === 405) {
      return {
        label: "llm proxy",
        category: "network",
        severity: "ok",
        value: `/api/v1/llm/* reachable (405 as expected)`,
      }
    }
    if (res.status === 404) {
      return {
        label: "llm proxy",
        category: "network",
        severity: "warn",
        value: "/api/v1/llm/* not found (404)",
        fix: "Proxy may not be deployed yet. BYOK still works — set AI_GATEWAY_API_KEY.",
      }
    }
    return {
      label: "llm proxy",
      category: "network",
      severity: "warn",
      value: `unexpected status ${res.status}`,
      fix: "Retry in a moment, or check Vercel status.",
    }
  } catch (err) {
    const aborted = (err as { name?: string }).name === "AbortError"
    return {
      label: "llm proxy",
      category: "network",
      severity: "warn",
      value: aborted ? "timed out after 2s" : "unreachable",
      fix: "Check your connection. BYOK (AI_GATEWAY_API_KEY) still works offline of helpbase.dev.",
    }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * GET /api/v1/usage/today with the session token. Confirms the user can
 * actually read their own quota. Only runs when the user is signed in AND
 * not in BYOK mode (BYOK bypasses this endpoint entirely).
 */
async function checkUsageEndpoint(accessToken: string): Promise<Check> {
  const url = "https://helpbase.dev/api/v1/usage/today"
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 2000)
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
    if (res.ok) {
      const body = (await res.json()) as { quota?: { usedToday?: number; dailyLimit?: number } }
      const used = body.quota?.usedToday ?? 0
      const cap = body.quota?.dailyLimit ?? 0
      return {
        label: "usage read",
        category: "network",
        severity: "ok",
        value: `${used.toLocaleString()} / ${cap.toLocaleString()} tokens today`,
      }
    }
    return {
      label: "usage read",
      category: "network",
      severity: "warn",
      value: `/api/v1/usage/today returned ${res.status}`,
      fix: res.status === 401
        ? "Session may be expired. Run `helpbase login` again."
        : "Retry in a moment, or check Vercel status.",
    }
  } catch (err) {
    const aborted = (err as { name?: string }).name === "AbortError"
    return {
      label: "usage read",
      category: "network",
      severity: "warn",
      value: aborted ? "timed out after 2s" : "unreachable",
    }
  } finally {
    clearTimeout(timeout)
  }
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

function nodeOk(): boolean {
  const major = parseInt(process.version.replace(/^v/, "").split(".")[0] ?? "0", 10)
  return major >= 20
}
