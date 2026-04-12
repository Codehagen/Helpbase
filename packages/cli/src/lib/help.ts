import type { Command } from "commander"
import pc from "picocolors"

/**
 * Grouped `--help` rendering.
 *
 * Commander's default help lists all subcommands alphabetically, which forces
 * first-time users to scan 12 equally-weighted commands before picking a path.
 * We group by intent and surface the 3 most common up top. The `category`
 * metadata on each command (set via `.configureHelp({ sortSubcommands: ... })`
 * is not enough; we override `helpInformation()` instead).
 *
 * To categorize a subcommand, add it to GROUPS below. Anything not listed
 * lands in the "Other" group.
 */

type CategoryLabel =
  | "Get started"
  | "Ship"
  | "Author"
  | "Account"
  | "Diagnose"

interface GroupDef {
  label: CategoryLabel
  commands: string[]
}

const GROUPS: GroupDef[] = [
  { label: "Get started", commands: ["new", "dev"] },
  { label: "Ship", commands: ["deploy", "link", "open"] },
  { label: "Author", commands: ["generate", "audit"] },
  { label: "Account", commands: ["login", "logout", "whoami", "config"] },
  { label: "Diagnose", commands: ["doctor", "feedback"] },
]

const MOST_COMMON = ["helpbase new", "helpbase dev", "helpbase deploy"]

/**
 * Render grouped help text for the top-level program. Returns a string
 * suitable for replacing Commander's default `helpInformation()`.
 */
export function renderGroupedHelp(program: Command): string {
  // `hidden` is set by Commander at runtime but isn't on the public type.
  const subcommands = program.commands.filter((c) => !(c as { hidden?: boolean }).hidden)
  const byName = new Map(subcommands.map((c) => [c.name(), c] as const))
  const seen = new Set<string>()
  const lines: string[] = []

  // Synopsis + description
  lines.push(`${pc.bold("helpbase")} ${pc.dim(`v${program.version() ?? ""}`)}`)
  lines.push(program.description() ?? "")
  lines.push("")

  // "Most common" cheatsheet
  lines.push(pc.bold("Most common:"))
  lines.push(`  ${MOST_COMMON.map((c) => pc.cyan(c)).join(pc.dim("  ·  "))}`)
  lines.push("")

  // Usage line
  lines.push(pc.bold("Usage:"))
  lines.push(`  helpbase ${pc.dim("[global-options]")} <command> ${pc.dim("[command-options]")}`)
  lines.push("")

  // Global options (collected from the program itself)
  const globalOpts = program.options.filter((o) => !(o as { hidden?: boolean }).hidden)
  if (globalOpts.length) {
    lines.push(pc.bold("Global options:"))
    const flagsWidth = Math.max(...globalOpts.map((o) => o.flags.length))
    for (const opt of globalOpts) {
      lines.push(`  ${opt.flags.padEnd(flagsWidth)}  ${pc.dim(opt.description)}`)
    }
    const helpFlag = "-h, --help".padEnd(flagsWidth)
    lines.push(`  ${helpFlag}  ${pc.dim("display help for command")}`)
    lines.push("")
  }

  // Grouped commands
  lines.push(pc.bold("Commands:"))
  const nameWidth = Math.max(...subcommands.map((c) => c.name().length))
  for (const group of GROUPS) {
    const groupCommands = group.commands
      .map((n) => byName.get(n))
      .filter((c): c is Command => Boolean(c))
    if (!groupCommands.length) continue
    lines.push("")
    lines.push(`  ${pc.dim(group.label)}`)
    for (const cmd of groupCommands) {
      seen.add(cmd.name())
      lines.push(
        `    ${pc.cyan(cmd.name().padEnd(nameWidth))}  ${cmd.description()}`,
      )
    }
  }

  // Anything not listed above lands in "Other" so we don't hide commands
  // silently if someone adds one without updating GROUPS.
  const ungrouped = subcommands.filter((c) => !seen.has(c.name()))
  if (ungrouped.length) {
    lines.push("")
    lines.push(`  ${pc.dim("Other")}`)
    for (const cmd of ungrouped) {
      lines.push(
        `    ${pc.cyan(cmd.name().padEnd(nameWidth))}  ${cmd.description()}`,
      )
    }
  }

  lines.push("")
  lines.push(
    pc.dim(
      "Run `helpbase <command> --help` for command-specific options.\n" +
        "Docs: https://helpbase.dev",
    ),
  )
  lines.push("")
  return lines.join("\n")
}
