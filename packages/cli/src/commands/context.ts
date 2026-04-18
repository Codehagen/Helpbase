import { Command } from "commander"
import pc from "picocolors"
import {
  applyIngestOptions,
  runIngestAction,
  type IngestOpts,
} from "./ingest.js"
import { isJsonMode, isQuiet } from "../lib/tty.js"

/**
 * Deprecated `helpbase context` alias for `helpbase ingest`.
 *
 * Kept alive so CI scripts, blog posts, and user muscle memory don't
 * break when we renamed the command. Every flag on `ingest` is mirrored
 * here via `applyIngestOptions`, and the same `runIngestAction` handler
 * runs — so behavior is identical. Only difference: a one-line
 * deprecation warning on stderr before the real work starts.
 *
 * Suppressed under `--json` / `--quiet` so pipes and scripts don't get
 * a stray non-JSON line polluting their output.
 *
 * Slated for removal in v0.7. Until then, this is the full-fidelity
 * alias: same options, same exit codes, same next-steps output.
 */

export const contextCommand = applyIngestOptions(
  new Command("context").description(
    "[deprecated: use `helpbase ingest`] Turn a repo into agent-ready docs.",
  ),
)
  .addHelpText(
    "after",
    `
${pc.yellow("This command is deprecated.")} Use ${pc.cyan("helpbase ingest")} instead — same flags,
same behavior. Slated for removal in v0.7.

Examples:
  $ helpbase ingest .                               # ingest current repo
  $ helpbase ingest . --ask "how do I log in?"      # ingest + answer in terminal

See: ${pc.cyan("helpbase ingest --help")}
`,
  )
  .action(async (repoPathArg: string, opts: IngestOpts) => {
    emitDeprecationWarning()
    await runIngestAction(repoPathArg, opts)
  })

function emitDeprecationWarning(): void {
  if (isJsonMode() || isQuiet()) return
  process.stderr.write(
    `${pc.yellow("!")} ${pc.dim("helpbase context is deprecated. Use ")}${pc.cyan(
      "helpbase ingest",
    )}${pc.dim(" — same flags, same behavior. Removed in v0.7.")}\n`,
  )
}
