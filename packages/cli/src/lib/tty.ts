/**
 * Capability gates for decorative output.
 *
 * stdout is reserved for composable output (JSON, URLs, paths, file contents).
 * stderr hosts everything else: spinners, prompts, notes, next-step blocks,
 * summary tables, update notices, error messages.
 *
 * Any call that produces decorative output MUST check the relevant gate here
 * first. See lib/ui.ts for the sanctioned writers.
 *
 * Environment overrides (all take precedence over auto-detection):
 *   HELPBASE_JSON=1   → forces --json semantics process-wide
 *   HELPBASE_QUIET=1  → forces --quiet semantics process-wide
 *   NO_COLOR=1        → disables color everywhere
 *   FORCE_COLOR=1     → re-enables color (even in CI or piped)
 *   CI                → anything truthy suppresses spinners + prompts + decoration
 *
 * Commander passes --json and --quiet as program-level booleans (see index.ts).
 * We mirror those into env vars early so helpers called before a Command
 * instance is available still see the right mode.
 */

const truthy = (v: string | undefined): boolean => Boolean(v && v !== "0" && v !== "false")

export function isTTY(): boolean {
  return Boolean(process.stdout.isTTY)
}

export function isStderrTTY(): boolean {
  return Boolean(process.stderr.isTTY)
}

export function isCI(): boolean {
  return truthy(process.env.CI)
}

export function isJsonMode(): boolean {
  return truthy(process.env.HELPBASE_JSON)
}

export function isQuiet(): boolean {
  return truthy(process.env.HELPBASE_QUIET)
}

/**
 * Sync the --json/--quiet Commander flags into env vars so lib helpers
 * (called before parse() or inside action handlers) see the same truth.
 * Idempotent; safe to call once at parse time.
 */
export function syncFlags(opts: { json?: boolean; quiet?: boolean }): void {
  if (opts.json) process.env.HELPBASE_JSON = "1"
  if (opts.quiet) process.env.HELPBASE_QUIET = "1"
}

export function canColor(): boolean {
  if (truthy(process.env.NO_COLOR)) return false
  if (truthy(process.env.FORCE_COLOR)) return true
  // picocolors also checks these plus TTY; mirror its logic so callers
  // that gate on canColor() stay consistent with picocolors output.
  return isStderrTTY() && !isCI()
}

/** True when we're allowed to draw an animated spinner on stderr. */
export function canSpinner(): boolean {
  if (isQuiet() || isJsonMode()) return false
  if (isCI()) return false
  return isStderrTTY()
}

/** True when it's safe to show an interactive prompt. */
export function canPrompt(): boolean {
  if (isJsonMode() || isQuiet()) return false
  if (isCI()) return false
  // Prompts read from stdin, so stdin must be a TTY too.
  return Boolean(process.stdin.isTTY) && isStderrTTY()
}

/**
 * True when decorative epilogues (next-steps, summary tables, update boxes,
 * freestanding notes) are welcome.
 *
 * Requires BOTH streams to be TTYs. This is the gh/stripe rule:
 *   - stdout piped (`helpbase new | cat`) → composition mode; epilogues
 *     would be noise even though they go to stderr, because they're framing
 *     output the caller is parsing on stdout.
 *   - stderr piped (`helpbase new 2>log`) → nobody's watching; skip.
 *
 * Spinners use canSpinner() instead, which only requires stderr — progress
 * indication is useful during piped runs.
 */
export function canDecorate(): boolean {
  if (isJsonMode() || isQuiet()) return false
  if (isCI()) return false
  return isTTY() && isStderrTTY()
}
