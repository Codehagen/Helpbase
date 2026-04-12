import pc from "picocolors"
import { spinner as clackSpinner } from "@clack/prompts"
import { HelpbaseError } from "./errors.js"
import { canDecorate, canPrompt, canSpinner } from "./tty.js"

/**
 * Sanctioned writers for CLI output.
 *
 *   stdout → composable: JSON, URLs, paths, file contents
 *   stderr → decorative: spinners, notes, next-steps, summaries, errors
 *
 * All helpers here write to stderr and silently suppress when the relevant
 * capability gate (lib/tty.ts) says no. Commands should almost never write
 * directly to process.stdout.write — reach for `emit()` when they need to.
 *
 * See /plan-devex-review output policy (Phase 1, plan §P1-1) for rationale.
 */

// ── stderr writers (decorative) ────────────────────────────────────

/** Write a line to stderr. Suppressed in --json/--quiet/CI/non-TTY. */
export function note(message: string): void {
  if (!canDecorate()) return
  process.stderr.write(`${message}\n`)
}

/** Success line with green check. */
export function ok(message: string): void {
  if (!canDecorate()) return
  process.stderr.write(`${pc.green("✓")} ${message}\n`)
}

/** Info line with dim arrow. Always visible unless --quiet/--json. */
export function info(message: string): void {
  if (!canDecorate()) return
  process.stderr.write(`${pc.dim("›")} ${message}\n`)
}

/** Warning line (yellow). Visible even in CI so important advisories land. */
export function warn(message: string): void {
  // Warnings intentionally bypass canDecorate() so CI still sees them,
  // but honor --quiet/--json (use stderr, no color).
  if (process.env.HELPBASE_QUIET) return
  if (process.env.HELPBASE_JSON) return
  const prefix = process.stderr.isTTY ? pc.yellow("⚠") : "warning:"
  process.stderr.write(`${prefix} ${message}\n`)
}

/** Blank line on stderr, gated by canDecorate. */
export function blank(): void {
  if (!canDecorate()) return
  process.stderr.write("\n")
}

// ── stdout writer (composable) ─────────────────────────────────────

/** Write a composable line to stdout. Never suppressed. */
export function emit(line: string): void {
  process.stdout.write(`${line}\n`)
}

/** Emit a JSON object on stdout, one per line. Never suppressed. */
export function emitJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

// ── spinner wrapper ────────────────────────────────────────────────

export interface Spinner {
  start(msg?: string): void
  message(msg: string): void
  stop(msg?: string, code?: number): void
}

/**
 * TTY-aware spinner. When spinners aren't safe (CI, pipes, --json, --quiet),
 * falls back to single-line "→ message" logs on stderr — no ANSI, no motion,
 * still informative.
 */
export function spinner(): Spinner {
  if (canSpinner()) return clackSpinner()

  // Fallback path: single-line log per unique message. Used in CI, pipes,
  // --json, --quiet. Writes directly so it stays visible even when
  // canDecorate() is false (progress indication is useful in CI logs).
  let lastMessage = ""
  const quiet = () => process.env.HELPBASE_QUIET
  return {
    start(msg?: string) {
      if (!msg || quiet()) return
      lastMessage = msg
      process.stderr.write(`${pc.dim("›")} ${msg}\n`)
    },
    message(msg: string) {
      if (!msg || msg === lastMessage || quiet()) return
      lastMessage = msg
      process.stderr.write(`${pc.dim("›")} ${msg}\n`)
    },
    stop(msg?: string, code = 0) {
      if (!msg || quiet()) return
      const prefix = code !== 0 ? pc.red("✖") : pc.green("✓")
      process.stderr.write(`${prefix} ${msg}\n`)
    },
  }
}

// ── next-step blocks ───────────────────────────────────────────────

export interface NextStepsInput {
  commands?: string[]
  urls?: Array<{ label?: string; url: string }>
}

/**
 * Print a "Next:" block on stderr. Non-negotiable TTY-only.
 * Script callers (CI, --json, --quiet, piped stdout) see nothing.
 */
export function nextSteps(input: NextStepsInput): void {
  if (!canDecorate()) return
  const parts: string[] = []
  if (input.commands?.length) {
    parts.push(input.commands.map((c) => pc.cyan(c)).join(pc.dim("  ·  ")))
  }
  if (input.urls?.length) {
    for (const u of input.urls) {
      const label = u.label ? `${u.label} ` : ""
      parts.push(`${label}${pc.underline(u.url)}`)
    }
  }
  if (!parts.length) return
  process.stderr.write(`\n${pc.dim("Next:")}  ${parts.join("\n         ")}\n`)
}

// ── summary tables ─────────────────────────────────────────────────

/**
 * 2-column aligned table on stderr. Gray labels, cyan values.
 * Suppressed in --json/--quiet/CI/non-TTY. For JSON consumers, emit an
 * equivalent object via emitJson() on the same command.
 */
export function summaryTable(rows: Array<[label: string, value: string]>): void {
  if (!canDecorate()) return
  if (!rows.length) return
  const labelWidth = Math.max(...rows.map(([l]) => l.length))
  process.stderr.write("\n")
  for (const [label, value] of rows) {
    process.stderr.write(`  ${pc.dim(label.padEnd(labelWidth))}  ${pc.cyan(value)}\n`)
  }
}

// ── interactive gate ───────────────────────────────────────────────

/**
 * Commands that want to prompt must call this first. Non-interactive
 * environments get a clear HelpbaseError pointing at the flag(s) to pass.
 *
 *   requirePrompt("helpbase new", ["--title", "--type"])
 */
export function requirePrompt(
  commandLabel: string,
  flags: string[],
): void {
  if (canPrompt()) return
  const flagList = flags.join(" ")
  throw new HelpbaseError({
    code: "E_MISSING_FLAG",
    problem: `${commandLabel} needs flags in non-interactive mode`,
    cause:
      "stdin isn't a TTY, or CI/--json/--quiet is set, so interactive prompts can't run.",
    fix: `Pass the required flags: ${flagList}`,
  })
}
