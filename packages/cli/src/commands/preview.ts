import { Command } from "commander"
import pc from "picocolors"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { createRequire } from "node:module"

import { contextError } from "./context-errors.js"

/**
 * `helpbase preview` — materialize a human-facing help center from the
 * `.helpbase/docs/` `helpbase context` just produced.
 *
 * The generated MDX is not a website on its own. This command bridges it
 * by caching a full Next.js renderer at `~/.helpbase/preview-<version>/`,
 * pointing it at the current project's `.helpbase/docs/` via the
 * `HELPBASE_CONTENT_DIR` env var, and running `next dev`.
 *
 * First run (per CLI version): scaffolds the renderer via `npx
 * create-helpbase`, runs `npm install`, then `next dev`. Roughly 45-60s.
 * Every run after: ~3s to `next dev`, zero network.
 *
 * The cache is keyed by the helpbase CLI version so upgrading the CLI
 * automatically picks up a fresh scaffold without manual cleanup. Users
 * can force-reset with `--reset`.
 *
 * Per-project alternative (scaffold under `<repo>/.helpbase/preview/`)
 * was considered and rejected — it adds ~400MB of node_modules to every
 * repo the user runs helpbase in, and the cached shared copy is
 * meaningfully faster in practice.
 */

const require_ = createRequire(import.meta.url)

interface PreviewOpts {
  port: string
  /** Wipe the cached preview and re-scaffold from scratch. */
  reset?: boolean
  /** Install-only (scaffolds and installs, skips `next dev`). Useful for
   *  warming the cache in CI or before presenting a demo. */
  setupOnly?: boolean
}

export const previewCommand = new Command("preview")
  .description(
    "Open a browser-viewable help center from the docs `helpbase context` generated.",
  )
  .option("-p, --port <port>", "Port to serve on", "3000")
  .option("--reset", "Wipe the cached preview renderer and re-scaffold")
  .option("--setup-only", "Scaffold and install without starting the server")
  .addHelpText(
    "after",
    `
Examples:
  $ helpbase preview                  # open http://localhost:3000
  $ helpbase preview --port 4001      # use a different port
  $ helpbase preview --reset          # wipe the cache and re-scaffold
  $ helpbase preview --setup-only     # warm the cache, don't start server

First run takes ~45-60s (scaffold + install). Every run after is ~3s.

Pair with:
  $ helpbase context .                # generate the docs first
`,
  )
  .action(async (opts: PreviewOpts) => {
    await runPreview(opts)
  })

async function runPreview(opts: PreviewOpts): Promise<void> {
  const repoRoot = process.cwd()
  const contentDir = path.resolve(repoRoot, ".helpbase", "docs")

  if (!fs.existsSync(contentDir)) {
    throw contextError("E_CONTEXT_PREVIEW_NO_DOCS", {
      cause: `No ${pc.cyan(".helpbase/docs/")} directory at ${repoRoot}.`,
    })
  }

  const previewDir = resolvePreviewCacheDir()

  if (opts.reset && fs.existsSync(previewDir)) {
    process.stderr.write(
      `${pc.dim("›")} --reset: removing cached preview at ${pc.cyan(previewDir)}\n`,
    )
    fs.rmSync(previewDir, { recursive: true, force: true })
  }

  const needsScaffold = !fs.existsSync(path.join(previewDir, "package.json"))
  const needsInstall = !fs.existsSync(path.join(previewDir, "node_modules"))

  if (needsScaffold) {
    scaffoldPreview(previewDir)
  }
  if (needsInstall) {
    installPreviewDeps(previewDir)
  }

  if (opts.setupOnly) {
    process.stderr.write(
      `${pc.green("✓")} Preview cache is ready at ${pc.cyan(previewDir)}\n` +
        `  ${pc.dim("Run")} ${pc.cyan("helpbase preview")} ${pc.dim("(without --setup-only) to start the server.")}\n`,
    )
    return
  }

  startNextDev({ previewDir, contentDir, port: opts.port })
}

/**
 * `~/.helpbase/preview-<cli-version>/` — cache location.
 *
 * Keyed by the CLI's package version so a CLI upgrade automatically
 * picks up a fresh scaffold (since the templates and lib/content-dir.ts
 * may have changed). Old caches are NOT garbage-collected automatically
 * to avoid surprising the user when disk space matters; `--reset`
 * handles manual cleanup and future `helpbase doctor` work can list
 * stale caches.
 */
function resolvePreviewCacheDir(): string {
  const base = path.join(os.homedir(), ".helpbase")
  return path.join(base, `preview-${readCliVersion()}`)
}

function readCliVersion(): string {
  try {
    // The bundled file lives at `packages/cli/dist/index.js` (also in
    // npm installs under `node_modules/helpbase/dist/index.js`). The
    // package.json is one level up, next to dist/.
    const pkg = require_("../package.json") as { version?: string }
    return pkg.version ?? "dev"
  } catch {
    return "dev"
  }
}

/**
 * create-helpbase and helpbase (CLI) version independently. We pin the
 * scaffolder we invoke so a bad release can't silently change the
 * preview's shape between CLI versions. Bump this when we intentionally
 * adopt a new scaffold (and add a CHANGELOG entry so users know).
 */
const SCAFFOLD_PACKAGE = "create-helpbase@0.1.0"

function scaffoldPreview(previewDir: string): void {
  const parent = path.dirname(previewDir)
  fs.mkdirSync(parent, { recursive: true })

  process.stderr.write(
    `${pc.dim("›")} Scaffolding preview renderer at ${pc.cyan(previewDir)}\n` +
      `  ${pc.dim("(first run per CLI version — takes ~15s)")}\n`,
  )

  const spec = SCAFFOLD_PACKAGE

  // npx create-helpbase prompts interactively by default. We pass the
  // directory positionally + --no-install (we install manually so we
  // can use the user's preferred package manager) + --no-open. The
  // project name is derived from the leaf dir name by create-helpbase,
  // which is fine — the preview isn't user-facing content.
  const result = spawnSync(
    "npx",
    ["--yes", spec, path.basename(previewDir), "--no-install", "--no-open"],
    {
      cwd: parent,
      stdio: ["ignore", "inherit", "inherit"],
      env: { ...process.env, CI: "1" },
    },
  )
  if (result.status !== 0) {
    throw contextError("E_CONTEXT_PREVIEW_SCAFFOLD", {
      cause: `npx create-helpbase exited with code ${result.status ?? "null"}.`,
    })
  }
  if (!fs.existsSync(path.join(previewDir, "package.json"))) {
    throw contextError("E_CONTEXT_PREVIEW_SCAFFOLD", {
      cause: `Scaffold succeeded according to exit code, but ${previewDir}/package.json is missing.`,
    })
  }
}

function installPreviewDeps(previewDir: string): void {
  const pm = detectPackageManager()
  process.stderr.write(
    `${pc.dim("›")} Installing preview dependencies with ${pc.cyan(pm)}\n` +
      `  ${pc.dim("(first run per CLI version — takes ~30s)")}\n`,
  )
  const result = spawnSync(pm, ["install"], {
    cwd: previewDir,
    stdio: ["ignore", "inherit", "inherit"],
    env: process.env,
  })
  if (result.status !== 0) {
    throw contextError("E_CONTEXT_PREVIEW_INSTALL", {
      cause: `${pm} install exited with code ${result.status ?? "null"}.`,
    })
  }
}

/**
 * Prefer the package manager the user already uses (pnpm > yarn > bun >
 * npm). `npm` is the fallback because it's always present with Node.
 * We check PATH rather than lockfiles because the cache dir is brand new.
 */
function detectPackageManager(): "pnpm" | "yarn" | "bun" | "npm" {
  const has = (bin: string) =>
    spawnSync("sh", ["-c", `command -v ${bin}`], { stdio: "ignore" }).status === 0
  if (has("pnpm")) return "pnpm"
  if (has("yarn")) return "yarn"
  if (has("bun")) return "bun"
  return "npm"
}

function startNextDev(args: {
  previewDir: string
  contentDir: string
  port: string
}): void {
  const { previewDir, contentDir, port } = args
  const pm = detectPackageManager()
  process.stderr.write(
    `${pc.dim("›")} Starting preview at ${pc.cyan(`http://localhost:${port}`)}\n` +
      `  ${pc.dim("Rendering docs from")} ${pc.cyan(contentDir)}\n` +
      `  ${pc.dim("Press Ctrl-C to stop.")}\n\n`,
  )

  const env = {
    ...process.env,
    HELPBASE_CONTENT_DIR: contentDir,
    PORT: port,
  }

  // `<pm> dev -- --port <n>` passes --port through to next dev across
  // all four package managers we support. (npm uses -- to split; pnpm
  // forwards everything after the script name; yarn passes extra args
  // directly; bun follows pnpm.)
  const devArgs =
    pm === "npm"
      ? ["run", "dev", "--", "--port", port]
      : ["dev", "--port", port]

  const child: ChildProcess = spawn(pm, devArgs, {
    cwd: previewDir,
    stdio: "inherit",
    env,
  })

  const forward = (sig: NodeJS.Signals) => {
    process.on(sig, () => {
      if (!child.killed) child.kill(sig)
    })
  }
  forward("SIGINT")
  forward("SIGTERM")

  child.on("exit", (code) => {
    process.exit(code ?? 0)
  })
}
