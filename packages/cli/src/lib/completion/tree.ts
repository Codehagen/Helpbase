import type { Command } from "commander"

/**
 * Plain data model of the CLI tree. Shell-specific generators consume this
 * instead of touching Commander directly so adding a new shell is just
 * another pure function with the same input.
 *
 * Intentionally minimal: subcommand name + one-line description + long
 * flags only. No short flags (too many collisions across shells for
 * modest UX gain), no positional args, no dynamic values. Matches the
 * scope set in plan P2-1: static completion only.
 */

export interface CommandNode {
  name: string
  description: string
  /** Long-form flags like "--type", "--dir". No short flags, no values. */
  flags: FlagInfo[]
}

export interface FlagInfo {
  flag: string // "--type"
  description: string
}

export interface CliTree {
  /** Top-level program name (helpbase). */
  name: string
  /** Global --json / --quiet etc. */
  globalFlags: FlagInfo[]
  /** Every visible subcommand at the top level. */
  subcommands: CommandNode[]
}

export function extractTree(program: Command): CliTree {
  return {
    name: program.name(),
    globalFlags: extractFlags(program),
    subcommands: program.commands
      .filter((c) => !(c as { hidden?: boolean }).hidden)
      .map((c) => ({
        name: c.name(),
        description: c.description() || "",
        flags: extractFlags(c),
      })),
  }
}

function extractFlags(cmd: Command): FlagInfo[] {
  const out: FlagInfo[] = []
  const seen = new Set<string>()
  for (const opt of cmd.options) {
    if ((opt as { hidden?: boolean }).hidden) continue
    const long = extractLongFlag(opt.flags)
    if (!long || seen.has(long)) continue
    seen.add(long)
    out.push({ flag: long, description: opt.description || "" })
  }
  // Commander auto-injects --help; worth including so users get completion
  // for the one flag that never surprises.
  if (!seen.has("--help")) {
    out.push({ flag: "--help", description: "display help for command" })
  }
  return out
}

/**
 * Parse a Commander flag string like "-t, --type <type>" into "--type".
 * Commander stores the raw flag declaration; we only want the long form
 * for completion. Returns null if the option has no long flag (rare but
 * possible for `-V`-only version declarations).
 */
function extractLongFlag(flags: string): string | null {
  // Match "--foo-bar" (no-value) or "--foo-bar <...>" or similar.
  const match = flags.match(/--[a-z0-9][a-z0-9-]*/i)
  return match ? match[0] : null
}
