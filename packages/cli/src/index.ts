#!/usr/bin/env node

import { Command } from "commander"
import updateNotifier from "update-notifier"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { devCommand } from "./commands/dev.js"
import { generateCommand } from "./commands/generate.js"
import { auditCommand } from "./commands/audit.js"
import { newCommand } from "./commands/new.js"
import { deployCommand } from "./commands/deploy.js"
import { loginCommand } from "./commands/login.js"
import { logoutCommand } from "./commands/logout.js"
import { whoamiCommand } from "./commands/whoami.js"
import { linkCommand } from "./commands/link.js"
import { openCommand } from "./commands/open.js"
import { feedbackCommand } from "./commands/feedback.js"
import { configCommand } from "./commands/config.js"
import { doctorCommand } from "./commands/doctor.js"
import { sendEvent } from "./lib/telemetry.js"
import { isJsonMode, isQuiet, syncFlags } from "./lib/tty.js"
import { renderGroupedHelp } from "./lib/help.js"

// Parse --json/--quiet before anything decorative runs so helpers called
// during command registration (help text, update-notifier) see the mode.
preSyncGlobalFlags()

// Load package.json at runtime so the version and update check track the
// installed CLI, not a build-time snapshot. dist/ sits next to package.json
// after bundling; src/ is two levels up during development.
const pkg = loadPackageJson()

// Notify users of stale installs. Silent when up to date; boxed message
// on stderr otherwise. Disabled if NO_UPDATE_NOTIFIER or CI is set, or
// if the user asked for composable output (--json/--quiet) — boxes in a
// JSON stream break pipes.
if (!isJsonMode() && !isQuiet()) {
  updateNotifier({ pkg, updateCheckInterval: 1000 * 60 * 60 * 24 }).notify({
    defer: false,
    isGlobal: true,
  })
}

const program = new Command()
  .name("helpbase")
  .description("CLI for managing your Helpbase help center")
  .version(pkg.version)
  .option("--json", "Emit machine-readable JSON on stdout (suppresses decorative output)")
  .option("--quiet", "Suppress decorative output (spinners, next-steps, summaries)")
  .hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts() as { json?: boolean; quiet?: boolean }
    syncFlags(opts)
  })

// Grouped --help output. Commander's default sorts subcommands alphabetically,
// which leaves first-time users to scan 12 equal-weight commands. See lib/help.ts.
program.helpInformation = () => renderGroupedHelp(program)

program.addCommand(devCommand)
program.addCommand(generateCommand)
program.addCommand(auditCommand)
program.addCommand(newCommand)
program.addCommand(deployCommand)
program.addCommand(loginCommand)
program.addCommand(logoutCommand)
program.addCommand(whoamiCommand)
program.addCommand(linkCommand)
program.addCommand(openCommand)
program.addCommand(feedbackCommand)
program.addCommand(configCommand)
program.addCommand(doctorCommand)

// Telemetry dispatch: fires after each subcommand, no-op if user hasn't
// opted in. Records command name, duration, exit code, and flag names
// (not values). Never slows the CLI — 2s timeout, swallows errors.
const startedAt = Date.now()
program.hook("postAction", (_thisCommand, actionCommand) => {
  const cmdName = actionCommand.name()
  const flags = actionCommand.opts()
  const flagNames = Object.keys(flags).filter(
    (k) => flags[k] !== undefined && flags[k] !== false,
  )
  sendEvent(
    {
      command: cmdName,
      durationMs: Date.now() - startedAt,
      exitCode: 0,
      flags: flagNames,
    },
    pkg.version,
  )
})

program.parse()

/**
 * Scan argv for --json/--quiet before Commander runs. Commander's preAction
 * hook fires after help/version are handled, so setting env vars there is
 * too late for update-notifier and help text rendering.
 */
function preSyncGlobalFlags(): void {
  const argv = process.argv.slice(2)
  if (argv.includes("--json")) process.env.HELPBASE_JSON = "1"
  if (argv.includes("--quiet")) process.env.HELPBASE_QUIET = "1"
}

function loadPackageJson(): { name: string; version: string } {
  const here = dirname(fileURLToPath(import.meta.url))
  // Try dist/../package.json first (bundled), then src/../../package.json (dev).
  for (const candidate of [join(here, "../package.json"), join(here, "../../package.json")]) {
    try {
      return JSON.parse(readFileSync(candidate, "utf-8"))
    } catch {
      // try next
    }
  }
  // Last-resort fallback so a missing package.json never crashes the CLI.
  return { name: "helpbase", version: "0.0.0" }
}
