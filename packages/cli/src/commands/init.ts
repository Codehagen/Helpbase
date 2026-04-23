import { Command } from "commander"
import { spawn, spawnSync, type ChildProcess, type StdioOptions } from "node:child_process"
import pc from "picocolors"

/**
 * `helpbase init` — one-command setup for an existing project.
 *
 * Drops the full helpbase primitive into the current directory via the
 * shadcn CLI: help-center routes + starter MDX, the MCP server (mcp/),
 * and the GitHub Actions sync workflow. After this lands, `git push` is
 * enough to see the citation-grounded PR loop in action.
 *
 * This is a thin wrapper around `shadcn add <registry-url>`. We own the
 * branded command so the install story is `pnpm dlx helpbase init`
 * (matches the product name) rather than the 80-character shadcn URL
 * form. Power users who prefer the shadcn-native flow can still run
 * `shadcn add https://helpbase.dev/r/helpbase.json` directly — same files
 * land either way.
 *
 *   Default URL: https://helpbase.dev/r/helpbase.json
 *   Override:    HELPBASE_REGISTRY_URL env var, or --url flag
 */

export const DEFAULT_REGISTRY_URL = "https://helpbase.dev/r/helpbase.json"

interface InitOptions {
  url?: string
  yes?: boolean
  overwrite?: boolean
}

export const initCommand = new Command("init")
  .description("One-command install — drops the full helpbase primitive via shadcn")
  .option("--url <url>", "Override the registry URL (for staging or local testing)")
  .option("-y, --yes", "Skip interactive confirmations (pass through to shadcn)")
  .option("--overwrite", "Overwrite existing files without prompting")
  .addHelpText(
    "after",
    `
Examples:
  $ helpbase init                          # install from helpbase.dev
  $ helpbase init --yes                    # non-interactive (CI)
  $ HELPBASE_REGISTRY_URL=http://localhost:3000/r/helpbase.json helpbase init

What this lands:
  - app/(docs)/              help-center routes
  - components/, lib/        UI + MDX pipeline
  - content/                 starter MDX (getting-started, customization)
  - mcp/                     self-hosted MCP server for AI agents
  - .github/workflows/       helpbase-sync CI (OIDC, zero-config)

The shadcn-native form is also supported:
  $ pnpm dlx shadcn@latest add https://helpbase.dev/r/helpbase.json
`,
  )
  .action((opts: InitOptions) => {
    const url = opts.url ?? process.env.HELPBASE_REGISTRY_URL ?? DEFAULT_REGISTRY_URL
    const [cmd = "npx", ...prefix] = resolveShadcnCommand()
    const args: string[] = [...prefix, "add", url]
    if (opts.yes) args.push("--yes")
    if (opts.overwrite) args.push("--overwrite")
    const inherit: StdioOptions = "inherit"
    const child: ChildProcess = spawn(cmd, args, {
      cwd: process.cwd(),
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
 * Prefer the package manager the user invoked us with — matches their cache
 * and avoids re-downloading shadcn into a different store. Same detection
 * pattern as commands/add.ts and commands/preview.ts.
 */
export function resolveShadcnCommand(): string[] {
  const has = (bin: string): boolean =>
    spawnSync("sh", ["-c", `command -v ${bin}`], { stdio: "ignore" }).status === 0
  if (has("pnpm")) return ["pnpm", "dlx", "shadcn@latest"]
  if (has("bun")) return ["bunx", "shadcn@latest"]
  if (has("yarn")) return ["yarn", "dlx", "shadcn@latest"]
  return ["npx", "-y", "shadcn@latest"]
}
