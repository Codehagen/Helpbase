import { Command } from "commander"
import { spawn, spawnSync, type ChildProcess, type StdioOptions } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import pc from "picocolors"
import { warn } from "../lib/ui.js"

/**
 * `helpbase add <component...>` — thin wrapper around `shadcn add` so users
 * extending a scaffolded help center stay inside one CLI surface.
 *
 * The scaffold is already shadcn-shaped (components.json + components/ui/),
 * so this command does NOT need to run `shadcn init` first. It only needs
 * to forward the user's arguments to the upstream CLI in the project root.
 *
 * Why a wrapper instead of "just run npx shadcn":
 *   - Discoverability: the helpbase CLI lists `add` in --help next to
 *     `new`, `ingest`, `deploy`. A first-time user doesn't have to know
 *     shadcn exists to extend their UI.
 *   - Reinforces the "shadcn for docs" stance — every helpbase project
 *     IS a shadcn project, and the helpbase CLI says so.
 *   - Future-friendly: if we ever want to add helpbase-specific
 *     post-install steps (re-run llms.txt generation, etc.), we have a
 *     hook point.
 *
 * Implementation notes:
 *   - Runs in process.cwd() so the user can `cd my-help-center && helpbase
 *     add card`. Mirrors how shadcn itself behaves.
 *   - stdio inherited so shadcn's interactive prompts (overwrite confirms,
 *     registry picker, dependency install) render correctly.
 *   - Exit code passed through verbatim so CI scripts that wrap us see the
 *     same status as if they'd called shadcn directly.
 *   - Soft pre-flight: if components.json is missing we warn but still
 *     forward — `shadcn add` will print its own clearer error than we can,
 *     and we don't want to false-positive on edge layouts.
 */
export const addCommand = new Command("add")
  .description("Add shadcn components to your help center (forwards to `shadcn add`)")
  .argument(
    "[components...]",
    "Component names, URLs, or local paths (e.g. button card @acme/auth-form)",
  )
  .allowUnknownOption(true)
  .addHelpText(
    "after",
    `
Examples:
  $ helpbase add button card dialog
  $ helpbase add @acme/auth-form
  $ helpbase add                       # interactive picker

This is a wrapper around the upstream shadcn CLI. All flags pass through.
See https://ui.shadcn.com/docs/cli for the full option list.
`,
  )
  .action((components: string[]) => {
    const cwd = process.cwd()
    if (!fs.existsSync(path.join(cwd, "components.json"))) {
      warn(
        `No components.json in ${cwd} — this doesn't look like a shadcn project.\n` +
          `  If you scaffolded with create-helpbase, cd into that directory first.`,
      )
    }
    const [cmd = "npx", ...prefix] = resolveShadcnCommand()
    // Forward the user's component args plus any unknown options Commander
    // collected (e.g. --overwrite, --yes). allowUnknownOption(true) above
    // is what makes those options reach us instead of erroring at parse.
    const passthrough: string[] = [...prefix, "add", ...components, ...extraArgs()]
    const inherit: StdioOptions = "inherit"
    const child: ChildProcess = spawn(cmd, passthrough, {
      cwd,
      stdio: inherit,
      env: process.env,
    })
    child.on("exit", (code: number | null) => process.exit(code ?? 1))
    child.on("error", (err: Error) => {
      console.error(`${pc.red("✗")} Failed to spawn ${cmd}: ${err.message}`)
      process.exit(1)
    })
  })

/**
 * Pick the right way to invoke `shadcn@latest`. We prefer the package-
 * manager dlx of whatever the user invoked us with — matches their cache
 * and avoids re-downloading shadcn into a different store. Detection is
 * the same PATH-probe pattern preview.ts uses.
 */
function resolveShadcnCommand(): string[] {
  const has = (bin: string): boolean =>
    spawnSync("sh", ["-c", `command -v ${bin}`], { stdio: "ignore" }).status === 0
  if (has("pnpm")) return ["pnpm", "dlx", "shadcn@latest"]
  if (has("bun")) return ["bunx", "shadcn@latest"]
  if (has("yarn")) return ["yarn", "dlx", "shadcn@latest"]
  return ["npx", "-y", "shadcn@latest"]
}

/**
 * Commander consumes registered options but leaves unknown flags in
 * `process.argv` past the command name. Pull those out so the user can
 * pass `--overwrite`, `--yes`, etc., straight through to shadcn without
 * us re-declaring every option.
 */
function extraArgs(): string[] {
  const argv = process.argv.slice(2)
  const addIdx = argv.indexOf("add")
  if (addIdx === -1) return []
  const tail = argv.slice(addIdx + 1)
  // Strip the positional component names we already forwarded — anything
  // starting with `-` is an option for shadcn.
  return tail.filter((arg) => arg.startsWith("-"))
}
