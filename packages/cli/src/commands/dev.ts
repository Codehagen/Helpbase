import { Command } from "commander"
import { spawn, type ChildProcess } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import pc from "picocolors"
import { validateArticle } from "../audit.js"
import type { AuditIssue } from "../audit.js"
import { ok, warn, info } from "../lib/ui.js"

/**
 * `helpbase dev` — spawn `next dev` and run an on-save article linter
 * alongside it. Findings print to stderr as the user edits; clear on the
 * next valid save.
 *
 * Why spawn instead of execSync: the previous implementation blocked the
 * Node process, so we couldn't run a parallel watcher. `spawn` with
 * `stdio: "inherit"` gives next the terminal while our watcher runs in
 * the same event loop.
 *
 * SIGINT / SIGTERM propagate to the Next child; once it exits we exit
 * with the same code. If the watcher throws, the dev server keeps
 * running — linting is additive, not critical-path.
 */

const DEBOUNCE_MS = 300

export const devCommand = new Command("dev")
  .description("Start the development server")
  .option("-p, --port <port>", "Port to run on", "3000")
  .option("--no-lint", "Skip on-save article linting")
  .option("--content-dir <path>", "Directory to watch for MDX changes", "content")
  .action((opts: { port: string; lint: boolean; contentDir: string }) => {
    const pkgPath = path.resolve("package.json")
    if (!fs.existsSync(pkgPath)) {
      console.error(
        `${pc.red("✖")} No package.json in the current directory.\n` +
          `  This doesn't look like a helpbase project. To start one:\n` +
          `    ${pc.cyan("npx create-helpbase my-help-center")}\n`,
      )
      process.exit(1)
    }

    let hasNext = false
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
        dependencies?: Record<string, string>
        devDependencies?: Record<string, string>
      }
      hasNext = Boolean(pkg.dependencies?.next || pkg.devDependencies?.next)
    } catch {
      // Let next itself report the issue if package.json is malformed.
    }

    if (!hasNext) {
      console.error(
        `${pc.red("✖")} This directory doesn't depend on Next.js.\n` +
          `  helpbase dev wraps next dev — run it from a helpbase project root.\n` +
          `  To start one: ${pc.cyan("npx create-helpbase my-help-center")}\n`,
      )
      process.exit(1)
    }

    const contentDir = path.resolve(process.cwd(), opts.contentDir)
    const stopWatcher = opts.lint && fs.existsSync(contentDir)
      ? startLintWatcher(contentDir)
      : null
    if (opts.lint && !fs.existsSync(contentDir)) {
      info(`skipping lint — no ${opts.contentDir}/ directory`)
    }

    const child = spawn("npx", ["next", "dev", "--turbopack", "--port", opts.port], {
      stdio: "inherit",
      env: process.env,
    })

    const forward = (sig: NodeJS.Signals) => () => {
      // Pass SIGINT/SIGTERM through; next handles graceful shutdown.
      if (!child.killed) child.kill(sig)
    }
    process.on("SIGINT", forward("SIGINT"))
    process.on("SIGTERM", forward("SIGTERM"))

    child.on("exit", (code, signal) => {
      if (stopWatcher) stopWatcher()
      // Exit with the child's code, or 128+signal when killed by signal.
      // Matches shell convention. Ctrl+C producing non-zero is expected.
      process.exit(code ?? (signal ? 128 : 0))
    })
  })

/**
 * Watch `contentDir` for MDX changes and print lint findings to stderr.
 * Returns a stop function the caller invokes on child exit.
 *
 * Uses node's built-in fs.watch (recursive: true). chokidar handles
 * cross-platform edge cases better, but it's a 24KB dep and fs.watch
 * is good enough for a local content tree. If we ever need symlinks or
 * exotic FS behavior we can revisit.
 *
 * Per-file debounce suppresses the double-fire from editor atomic saves
 * (rename + write). Dedupes identical finding sets so a no-op save
 * doesn't spam the terminal.
 */
function startLintWatcher(contentDir: string): () => void {
  const timers = new Map<string, NodeJS.Timeout>()
  const lastFindings = new Map<string, string>() // file → serialized issues

  let watcher: fs.FSWatcher | null
  try {
    watcher = fs.watch(contentDir, { recursive: true }, (_event, filename) => {
      if (!filename) return
      const rel = filename.toString()
      if (!rel.endsWith(".mdx") && !rel.endsWith(".md")) return
      const full = path.join(contentDir, rel)
      schedule(full)
    })
  } catch (err) {
    warn(`lint watcher failed to start: ${(err as Error).message}`)
    return () => {}
  }

  info(`linting articles in ${path.relative(process.cwd(), contentDir) || contentDir}/ on save`)

  function schedule(file: string) {
    const existing = timers.get(file)
    if (existing) clearTimeout(existing)
    timers.set(
      file,
      setTimeout(() => {
        timers.delete(file)
        runLint(file)
      }, DEBOUNCE_MS),
    )
  }

  function runLint(file: string) {
    try {
      if (!fs.existsSync(file)) {
        // File deleted — clear any previous findings memory.
        lastFindings.delete(file)
        return
      }
      const issues = validateArticle(file)
      const serialized = issues
        .map((i) => `${i.level}:${i.message}`)
        .sort()
        .join("|")
      if (lastFindings.get(file) === serialized) return
      lastFindings.set(file, serialized)

      const rel = path.relative(process.cwd(), file)
      if (issues.length === 0) {
        ok(`${rel} ✓`)
        return
      }
      printFindings(rel, issues)
    } catch (err) {
      // Don't kill the dev server if the validator explodes on a weird file.
      warn(`lint failed for ${file}: ${(err as Error).message}`)
    }
  }

  return () => {
    for (const t of timers.values()) clearTimeout(t)
    timers.clear()
    watcher?.close()
  }
}

function printFindings(rel: string, issues: AuditIssue[]): void {
  const errors = issues.filter((i) => i.level === "error").length
  const warnings = issues.filter((i) => i.level === "warning").length
  const summary = [
    errors ? `${errors} error${errors === 1 ? "" : "s"}` : "",
    warnings ? `${warnings} warning${warnings === 1 ? "" : "s"}` : "",
  ]
    .filter(Boolean)
    .join(", ")
  process.stderr.write(`\n${pc.red("✖")} ${rel} — ${summary}\n`)
  for (const issue of issues) {
    const bullet = issue.level === "error" ? pc.red("•") : pc.yellow("•")
    process.stderr.write(`  ${bullet} ${issue.message}\n`)
  }
  process.stderr.write("\n")
}
