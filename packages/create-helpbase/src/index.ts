#!/usr/bin/env node

import { intro, outro, text, select, confirm, spinner, note, cancel, isCancel } from "@clack/prompts"
import { Command } from "commander"
import pc from "picocolors"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { execSync, spawn } from "node:child_process"
import {
  planArticleWrites,
  resolveModel,
  MissingApiKeyError,
  GatewayError,
  TEST_MODEL,
} from "@workspace/shared/ai"
import {
  scrapeUrl,
  generateArticlesFromContent,
} from "@workspace/shared/ai-text"
import { scaffoldProject, clearSampleContent } from "./scaffold.js"
import { readHelpbaseAuthToken } from "./auth.js"
import {
  generateFromRepo,
  AllDocsDroppedError,
  TokenBudgetExceededError,
  SchemaGenerationError,
} from "./generate-from-repo.js"
import { emitMcpJson } from "./emit-mcp-json.js"
import { resolveShipItNow, ShipItNowRefusedError } from "./ship-it-now.js"

/**
 * Read version from package.json at startup. The literal string used to be
 * hardcoded and drifted every release (CLI said 0.0.1 while npm shipped
 * 0.4.0). Reading from disk keeps them in sync — package.json is always
 * present in the published tarball regardless of the `files` allowlist.
 */
function readPackageVersion(): string {
  try {
    const pkgPath = fileURLToPath(new URL("../package.json", import.meta.url))
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { version?: string }
    if (typeof pkg.version === "string" && pkg.version.length > 0) {
      return pkg.version
    }
  } catch {
    // Fall through to the sentinel below. The version string is cosmetic;
    // a failure here should not crash the CLI on startup.
  }
  return "0.0.0-unknown"
}

interface RunOptions {
  url?: string
  source?: string
  install?: boolean
  open?: boolean
  test?: boolean
  model?: string
  internal?: boolean
  deploy?: boolean
}

const PROJECT_NAME_REGEX = /^[a-z0-9-]+$/
const GITHUB_URL_REGEX = /^https?:\/\/(?:www\.)?github\.com\/[^/]+\/[^/]+(?:\.git)?\/?$/i

function validateProjectName(name: string): string | undefined {
  if (!name) return "Project name is required"
  if (!PROJECT_NAME_REGEX.test(name)) {
    return "Use lowercase letters, numbers, and hyphens only"
  }
  return undefined
}

const program = new Command()
  .name("create-helpbase")
  .description("Create a beautiful, AI-powered help center in seconds")
  .version(readPackageVersion())
  .argument("[directory]", "Directory to create the project in")
  .option("--url <url>", "Generate articles from a website URL")
  .option(
    "--source <value>",
    "Seed content source: a URL (https://...), a local repo path, or 'skip' for sample content",
  )
  .option("--no-install", "Skip dependency installation")
  .option("--no-open", "Don't open browser after setup")
  .option(
    "--test",
    `Use the cheap test model (${TEST_MODEL}) for AI generation`,
  )
  .option("--model <id>", "Override the AI model ID")
  .option(
    "--internal",
    "Scaffold an internal-KB layout (handbook + runbooks + ADRs, auth-ready MCP via HELPBASE_MCP_TOKEN)",
  )
  .option(
    "--deploy",
    "Ship to helpbase cloud immediately after scaffold (skip the prompt, assume yes)",
  )
  .option(
    "--no-deploy",
    "Skip the ship-it-now prompt (scaffold only, keep today's behavior)",
  )
  .action(run)

program.parse()

type ContentSource =
  | { kind: "url"; url: string }
  | { kind: "repo"; repoPath: string; tempClone?: string }
  | { kind: "skip" }

async function run(directory: string | undefined, opts: RunOptions) {
  console.log()
  intro(pc.bgCyan(pc.black(" create-helpbase ")))

  // Non-TTY stdin means we're running inside a pipe, CI, or other
  // script context where we can't prompt the user. In that case,
  // skip all interactive prompts and require the directory arg.
  const isInteractive = Boolean(process.stdin.isTTY)

  // 1. Project name — validate CLI-provided names early so bad names fail
  //    before any filesystem work.
  if (directory !== undefined) {
    const err = validateProjectName(directory)
    if (err) {
      cancel(`${err}: ${pc.bold(directory)}`)
      process.exit(1)
    }
  }

  let projectName: string | symbol
  if (directory !== undefined) {
    projectName = directory
  } else if (!isInteractive) {
    cancel(
      "Project name is required when running non-interactively. " +
        "Pass a directory argument, e.g. `create-helpbase my-app`.",
    )
    process.exit(1)
  } else {
    projectName = await text({
      message: "What is your project called?",
      placeholder: "my-help-center",
      defaultValue: "my-help-center",
      validate(value) {
        return validateProjectName(value)
      },
    })
  }

  if (isCancel(projectName)) {
    cancel("Setup cancelled.")
    process.exit(0)
  }

  const projectDir = path.resolve(process.cwd(), projectName as string)

  if (fs.existsSync(projectDir)) {
    const files = fs.readdirSync(projectDir)
    if (files.length > 0) {
      cancel(`Directory ${pc.bold(projectName as string)} already exists and is not empty.`)
      process.exit(1)
    }
  }

  // 2. Login-first funnel capture (login-first scaffolder, 2026-04-19).
  //    Fires BEFORE source selection on every cold scaffold. Rationale:
  //    the previous design gated login on `source.kind !== "skip"` which
  //    meant Skip users walked through the whole flow without ever
  //    touching auth — 100% dead-air for the funnel. Moving it forward
  //    captures every scaffolder run as a lead and reserves their
  //    `docs-<hex>.helpbase.dev` subdomain before the user has picked a
  //    content source.
  //
  //    The prompt copy leads with the subdomain hook (concrete benefit
  //    + free-tier reassurance + 30s effort framing) rather than the
  //    abstract "log in" ask. Tested with founders: the concrete URL
  //    name converts better than "sign in to continue."
  //
  //    Skipped when:
  //    - Non-interactive (CI / piped stdin): can't device-flow anyway.
  //    - User already has a session on disk (`readHelpbaseAuthToken()`).
  //    - `HELPBASE_TOKEN` env var is set: CI users pre-issue tokens; no
  //      point prompting them to browser-flow through a login they
  //      already completed server-side.
  //
  //    BYOK users (ANTHROPIC_API_KEY / OPENAI_API_KEY / AI_GATEWAY_API_KEY)
  //    are NOT skipped here — they already have AI creds, but the
  //    subdomain reservation is orthogonal and still valuable. Declining
  //    ("Not now") lets them proceed; they just won't have a hosted
  //    target until they run `helpbase login` later.
  // `authToken` is the token threaded into AI generation calls. Prefer
  // the on-disk session, fall back to HELPBASE_TOKEN so CI/non-interactive
  // runs that pre-issue the env var get a working AI path without the
  // interactive login. Without this, the env-var user would skip the
  // prompt (good) but AI gen would still fail MissingApiKey because the
  // env var was never passed to `generateArticlesFromContent` /
  // `generateFromRepo`.
  let authToken =
    readHelpbaseAuthToken() || process.env.HELPBASE_TOKEN?.trim() || undefined
  if (
    isInteractive &&
    !authToken
  ) {
    const wantsLogin = await confirm({
      message:
        "Claim your free docs URL? (docs-<hex>.helpbase.dev + 500k AI tokens/day, no card)",
      initialValue: true,
    })
    if (isCancel(wantsLogin)) {
      cancel("Setup cancelled.")
      process.exit(0)
    }
    if (wantsLogin) {
      const loginResult = await runHelpbaseLogin()
      if (loginResult === "failed") {
        note(
          `Couldn't complete login. You can still scaffold + use sample content. Run ${pc.cyan("npx helpbase@latest login")} later to claim a subdomain.`,
          "Login skipped",
        )
      } else {
        // Re-read the token file — login just wrote it.
        authToken = readHelpbaseAuthToken()
      }
    }
    // Declined → fall through with no token. URL/repo sources without
    // BYOK will hit MissingApiKey at AI gen time and the scaffolder
    // falls back to sample content. The user gets a clear hint pointing
    // at `helpbase login` in the fallback message.
  }

  // 3. Content source selection.
  //    Explicit select first (URL / repo / skip), then the source-specific
  //    input. Rationale: single-prompt heuristics on the input itself made
  //    `my-repo` ambiguous between "subdirectory" and "bare URL without
  //    scheme". Splitting into select-then-input is explicit > clever.
  //    If --source / --url flags are set, honor them and skip the prompt.
  const source = await resolveContentSource({
    flagUrl: opts.url,
    flagSource: opts.source,
    isInteractive,
  })

  if (source === "cancelled") {
    cancel("Setup cancelled.")
    process.exit(0)
  }

  // 4. Scaffold the project
  const s = spinner()
  s.start("Creating your help center...")

  scaffoldProject({
    projectName: projectName as string,
    projectDir,
    internal: opts.internal,
  })

  s.stop("Project scaffolded!")

  // 5. Kick off `pnpm install` in the background so it runs while the LLM
  //    call is in flight. Install is network + disk I/O, LLM synthesis is
  //    network I/O — they don't compete. Cuts 30-60s off TTHW on the first
  //    real run (install used to be strictly serial, after generation).
  //    Install's stdout/stderr are captured (not piped to terminal) so they
  //    don't clobber the spinner that generation owns.
  const pkgManager = detectPackageManager()
  const installPromise: Promise<{ success: true } | { success: false; reason: string }> =
    opts.install !== false
      ? runInstallInBackground(projectDir, pkgManager)
      : Promise.resolve({ success: true } as const)

  if (opts.install !== false) {
    console.log(
      `  ${pc.dim("›")} Installing dependencies with ${pc.cyan(pkgManager)} in background...`,
    )
  }

  // 6. AI content generation — branches by source kind.
  //
  //    Invariant (Issue 1 fix from /plan-eng-review 2026-04-17): sample
  //    content stays on disk until LLM synthesis SUCCEEDS. The old flow
  //    ran clearSampleContent() before the LLM call, so a failure in the
  //    LLM path left the user with an empty content/ and a message
  //    claiming "sample content remains" — a lie. Now the clear happens
  //    in the onPhase("writing") callback, which fires only after
  //    synthesis returned + citations validated.
  let generationSucceeded = false

  if (source.kind === "url") {
    generationSucceeded = await runUrlGeneration({
      projectDir,
      url: source.url,
      model: resolveModel({ test: opts.test, modelOverride: opts.model }),
      authToken,
      spinner: s,
    })
  } else if (source.kind === "repo") {
    generationSucceeded = await runRepoGeneration({
      projectDir,
      repoPath: source.repoPath,
      model: resolveModel({ test: opts.test, modelOverride: opts.model }),
      authToken,
      spinner: s,
      tempClone: source.tempClone,
    })
  }

  // 7. Emit mcp.json at project root if generation produced docs.
  //    For `skip` source we keep the sample content + skip emit (sample
  //    content has no citations worth wiring into MCP for a stranger).
  if (generationSucceeded) {
    emitMcpJson(projectDir)
  }

  // 8. Wait for install to finish. If the LLM path was slower, install is
  //    already done and this resolves instantly; if install was slower, the
  //    spinner tells the user we're still waiting on it.
  if (opts.install !== false) {
    s.start(`Finishing ${pkgManager} install...`)
    const installResult = await installPromise
    if (installResult.success) {
      s.stop("Dependencies installed!")
    } else {
      s.stop(pc.yellow("Failed to install dependencies."))
      note(
        `Run ${pc.cyan(`cd ${projectName as string} && ${pkgManager} install`)} manually.\n` +
        `  Reason: ${installResult.reason}`,
        "Manual install needed",
      )
    }
  }

  // 8.5. Ship-it-now prompt (Shape A, 2026-04-18).
  //    If we're interactive, had real content generated, and the user
  //    didn't pass --no-deploy, offer to publish to helpbase cloud in
  //    one step. Collapses cold TTHW from ~3min → ~90s by removing the
  //    manual `cd` + `login` + `deploy` chain.
  //
  //    Y path: ensure auth (spawn login if no token), then spawn
  //    `helpbase deploy` in the new project dir with inherited stdio.
  //    On success, `helpbase deploy` already prints the live URL + MCP
  //    config block, so we skip the "Run it locally" + "What next" +
  //    dev-server-auto-open tail — the user's magical moment is the
  //    live URL, not localhost.
  //
  //    n path (or Y-failure): fall through to the existing local-first
  //    outro so nothing regresses for users who want to edit before
  //    shipping.
  // CI detection: `isInteractive` comes from `process.stdin.isTTY`, which CI
  // jobs can legitimately allocate. For the ship-it-now decision we want the
  // stricter "is this a real human" check so `--deploy --source skip` in CI
  // hits the non-interactive refusal path and does not drop into the N-default
  // confirm. `process.env.CI` is the de-facto convention (GitHub Actions,
  // CircleCI, GitLab, Travis all set it). Kept separate from `isInteractive`
  // so the earlier prompts (project name, source pick, login) preserve
  // today's "TTY means prompt" semantics.
  const humanInteractive = isInteractive && !process.env.CI

  let wantsDeploy: boolean
  try {
    wantsDeploy = await resolveShipItNow({
      flagDeploy: opts.deploy,
      sourceKind: source.kind,
      isInteractive: humanInteractive,
      generationSucceeded,
    })
  } catch (err) {
    if (err instanceof ShipItNowRefusedError) {
      cancel(err.message)
      process.exit(1)
    }
    throw err
  }

  if (wantsDeploy) {
    // `readHelpbaseAuthToken()` only reads ~/.helpbase/auth.json; it misses
    // the `HELPBASE_TOKEN` env var (the advertised CI path). `helpbase deploy`
    // itself handles the env var fine, but if we require a file-token here we
    // either spawn login (blocks forever in CI without a TTY) or bail early
    // before deploy ever runs. Treat the env var as a valid truthy gate; let
    // the subprocess validate it at the real auth boundary.
    let token =
      readHelpbaseAuthToken() || process.env.HELPBASE_TOKEN?.trim() || undefined
    if (!token && humanInteractive) {
      const r = await runHelpbaseLogin()
      if (r === "ok") token = readHelpbaseAuthToken()
    }
    if (!token) {
      note(
        `Couldn't log you in. Run ${pc.cyan(`cd ${projectName as string} && npx helpbase deploy`)} when you're ready.`,
        "Ship-it-now skipped",
      )
    } else {
      const deployResult = await runHelpbaseDeploy(projectDir)
      if (deployResult.kind === "ok") {
        outro(`${pc.green("Your help center is live!")}`)
        if (source.kind === "repo" && source.tempClone) {
          try {
            fs.rmSync(source.tempClone, { recursive: true, force: true })
          } catch {
            // best-effort
          }
        }
        return
      }
      note(
        `${pc.dim(deployResult.errorTail)}\n\n` +
          `Retry with ${pc.cyan(`cd ${projectName as string} && npx helpbase deploy`)}.`,
        "Deploy failed",
      )
    }
  }

  // 9. Done!
  const cdCmd = projectDir === process.cwd()
    ? ""
    : `cd ${projectName as string}`

  const devCmd = `${pkgManager === "npm" ? "npm run" : pkgManager} dev`
  const bootstrap = [
    cdCmd && pc.cyan(cdCmd),
    opts.install === false && pc.cyan(`${pkgManager} install`),
    pc.cyan(devCmd),
  ]
    .filter(Boolean)
    .join("\n")

  note(bootstrap, "Run it locally")

  // "What next" adapts to auth state. If the user declined the step-1
  // login prompt (or ran non-interactively without HELPBASE_TOKEN),
  // lead with `helpbase login` so the path to a subdomain is visible
  // at the end of the run. Logged-in users skip the redundant hint.
  //
  // Re-read the token file here rather than trusting the `authToken`
  // variable — it may be stale if the user declined step 1 but later
  // logged in via the ship-it-now path (which spawns `helpbase login`
  // in a subprocess and writes the token file from there). Avoiding a
  // redundant "run `helpbase login`" hint for someone who just did is
  // the whole point.
  const loggedIn =
    !!authToken ||
    !!readHelpbaseAuthToken() ||
    !!process.env.HELPBASE_TOKEN?.trim()
  const nextLines: string[] = []
  if (!loggedIn) {
    nextLines.push(
      `${pc.cyan("npx helpbase login")}                     ${pc.dim("claim docs-<hex>.helpbase.dev (free, no card)")}`,
    )
  }
  nextLines.push(
    `${pc.cyan("npx helpbase ingest .")}                 ${pc.dim("generate docs from your repo source")}`,
    `${pc.cyan("npx helpbase deploy")}                    ${pc.dim("go live at <slug>.helpbase.dev")}`,
    `${pc.cyan("npx helpbase new")}                       ${pc.dim("add a new article interactively")}`,
  )
  note(nextLines.join("\n"), "What next")

  outro(
    `${pc.green("Your help center is ready!")}\n` +
    `  Docs: ${pc.dim("https://helpbase.dev/getting-started/introduction")}`,
  )

  // 9. Start dev server + auto-open browser on "Ready" signal.
  //    Previously used execSync with stdio:inherit — user had to click the
  //    localhost link manually, which added 10-15s of "wait, now what?"
  //    time to TTHW. Spawning lets us tail stdout and open the browser the
  //    moment Next.js signals readiness. The magical moment (cited docs at
  //    localhost:3000) has to land in the user's eyes, not in their stdout.
  if (opts.install !== false && opts.open !== false) {
    await startDevServerWithAutoOpen(pkgManager, projectDir)
  }

  // 10. Clean up any temp clone (GitHub branch only).
  if (source.kind === "repo" && source.tempClone) {
    try {
      fs.rmSync(source.tempClone, { recursive: true, force: true })
    } catch {
      // best-effort
    }
  }
}

/**
 * Resolve the user's seed-content choice into a ContentSource. Honors
 * --url / --source flags first (non-interactive-friendly), then prompts
 * interactively. Handles GitHub URL detection by offering a
 * "clone this and generate from the source code instead of scraping" path.
 */
async function resolveContentSource(opts: {
  flagUrl?: string
  flagSource?: string
  isInteractive: boolean
}): Promise<ContentSource | "cancelled"> {
  // Flag short-circuit (scripted CI-friendly usage).
  if (opts.flagUrl) {
    return normalizeUrlInput(opts.flagUrl, /* offerClone */ false)
  }
  if (opts.flagSource) {
    return classifyFlagSource(opts.flagSource)
  }

  if (!opts.isInteractive) {
    // No flags, non-interactive — fall through to "skip" (sample content).
    return { kind: "skip" }
  }

  const choice = await select({
    message: "Seed content from?",
    options: [
      {
        value: "url",
        label: "A website",
        hint: "paste a URL, we scrape it",
      },
      {
        value: "repo",
        label: "A code repository",
        hint: "point at a local path or GitHub URL",
      },
      {
        value: "skip",
        label: "Skip",
        hint: "ship with sample content",
      },
    ],
    initialValue: "repo",
  })

  if (isCancel(choice)) return "cancelled"

  if (choice === "skip") return { kind: "skip" }

  if (choice === "url") {
    const urlResponse = await text({
      message: "Paste your website URL",
      placeholder: "https://myproduct.com",
    })
    if (isCancel(urlResponse)) return "cancelled"
    const raw = (urlResponse as string | undefined)?.trim()
    if (!raw) return { kind: "skip" }
    return normalizeUrlInput(raw, /* offerClone */ true)
  }

  // choice === "repo"
  const pathResponse = await text({
    message: "Paste the repo path (or a github.com URL)",
    placeholder: "./my-app",
  })
  if (isCancel(pathResponse)) return "cancelled"
  const raw = (pathResponse as string | undefined)?.trim()
  if (!raw) return { kind: "skip" }

  // A github.com URL pasted here: same clone path as the URL branch.
  if (GITHUB_URL_REGEX.test(raw)) {
    const cloned = await cloneGithubRepo(raw)
    if (cloned === "cancelled") return "cancelled"
    if (cloned === "failed") return { kind: "skip" }
    return { kind: "repo", repoPath: cloned, tempClone: cloned }
  }

  const abs = path.resolve(process.cwd(), raw)
  if (!fs.existsSync(abs)) {
    note(
      `Directory ${pc.bold(abs)} does not exist. Shipping sample content instead.`,
      "Path not found",
    )
    return { kind: "skip" }
  }
  if (!fs.statSync(abs).isDirectory()) {
    note(`${pc.bold(abs)} is not a directory. Shipping sample content instead.`, "Not a directory")
    return { kind: "skip" }
  }
  return { kind: "repo", repoPath: abs }
}

/**
 * Handle a raw URL input from the website branch. If it's a github.com
 * URL, offer to clone it and generate from source instead of scraping
 * GitHub's HTML (which would give us nav chrome, not docs).
 */
async function normalizeUrlInput(
  raw: string,
  offerClone: boolean,
): Promise<ContentSource | "cancelled"> {
  let url = raw
  if (!url.startsWith("http")) {
    url = `https://${url}`
  }
  if (offerClone && GITHUB_URL_REGEX.test(url)) {
    const wantsClone = await confirm({
      message: `That looks like a GitHub repo. Clone it and generate from source? (recommended — scraping github.com HTML gives nav chrome, not docs)`,
      initialValue: true,
    })
    if (isCancel(wantsClone)) return "cancelled"
    if (wantsClone) {
      const cloned = await cloneGithubRepo(url)
      if (cloned === "cancelled") return "cancelled"
      if (cloned === "failed") {
        // Fall back to scraping the URL as-is.
        return { kind: "url", url }
      }
      return { kind: "repo", repoPath: cloned, tempClone: cloned }
    }
  }
  return { kind: "url", url }
}

/**
 * Classify a --source flag value without prompting. Used when the CLI is
 * invoked non-interactively (CI, scripts).
 */
function classifyFlagSource(raw: string): ContentSource {
  const trimmed = raw.trim()
  if (!trimmed || trimmed.toLowerCase() === "skip") return { kind: "skip" }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return { kind: "url", url: trimmed }
  }
  const abs = path.resolve(process.cwd(), trimmed)
  if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
    return { kind: "repo", repoPath: abs }
  }
  // Last-ditch: treat as URL (http will be prepended if missing).
  return { kind: "url", url: trimmed.startsWith("http") ? trimmed : `https://${trimmed}` }
}

/**
 * `git clone --depth 1 <url> <tmpDir>`. Returns the temp directory path
 * on success, "failed" if git isn't installed or the clone errored,
 * "cancelled" if the user cancelled. Caller is responsible for cleanup.
 */
async function cloneGithubRepo(url: string): Promise<string | "failed" | "cancelled"> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-scaffold-"))
  const sClone = spinner()
  sClone.start(`Cloning ${pc.cyan(url)}...`)
  try {
    execSync(`git clone --depth 1 ${JSON.stringify(url)} ${JSON.stringify(tmpDir)}`, {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 60_000,
    })
    sClone.stop("Repo cloned.")
    return tmpDir
  } catch (err) {
    sClone.stop(pc.yellow(`Couldn't clone ${url}.`))
    note(
      `Check the URL or that git is installed. ${err instanceof Error ? err.message : ""}\n` +
      `Falling back to sample content.`,
      "Clone failed",
    )
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      // best-effort
    }
    return "failed"
  }
}

/**
 * Run the URL branch: scrape + LLM + write. Deferred clearSampleContent
 * per Issue 1 fix — sample content stays on disk until AFTER the LLM
 * returns successfully, so a failure mid-call leaves the user with a
 * working (sample) scaffold rather than an empty one.
 */
async function runUrlGeneration(opts: {
  projectDir: string
  url: string
  model: string
  authToken?: string
  spinner: ReturnType<typeof spinner>
}): Promise<boolean> {
  const { projectDir, url, model, authToken, spinner: s } = opts
  try {
    s.start(`Scraping ${pc.cyan(url)}...`)
    const content = await scrapeUrl(url)
    s.stop("Site scraped.")

    s.start(`Synthesizing articles with ${pc.dim(model)} ${pc.dim("(~10-25s)")}...`)
    const articles = await generateArticlesFromContent({
      content,
      sourceUrl: url,
      model,
      // Use the token threaded from run() — honors HELPBASE_TOKEN env var
      // for CI callers AND the step-1 login path. Re-reading disk here
      // would miss the env-var case entirely.
      authToken,
    })
    s.stop(`Synthesized ${articles.length} article${articles.length === 1 ? "" : "s"}.`)

    s.start("Writing articles...")
    // Deferred clear: sample content is only removed once we have something
    // to replace it with.
    clearSampleContent(projectDir)
    writeArticlesToContentDir(projectDir, articles)
    s.stop("Articles generated!")
    return true
  } catch (err) {
    s.stop(pc.yellow("Couldn't generate articles. Sample content shipped with the scaffold remains."))
    printGenerationFallbackHint(err, url)
    return false
  }
}

/**
 * Run the repo branch: walk + LLM + validate + write. The three-stage
 * spinner mirrors the URL branch but maps to the richer phases generate-
 * from-repo exposes via onPhase (scanning → synthesizing → writing).
 * clearSampleContent fires in the writing phase, after synthesis succeeded.
 */
async function runRepoGeneration(opts: {
  projectDir: string
  repoPath: string
  model: string
  authToken?: string
  spinner: ReturnType<typeof spinner>
  tempClone?: string
}): Promise<boolean> {
  const { projectDir, repoPath, model, authToken, spinner: s } = opts
  // Track the label of the phase that's currently under the spinner so we
  // can emit a matching completion line when the next phase starts. Empty
  // s.stop() prints a bare "◇" line which looks broken; labeled stops
  // create a clean ladder (Site scanned → Articles synthesized → Written).
  let lastPhase: "scanning" | "synthesizing" | "writing" | null = null
  const stopCurrent = () => {
    if (lastPhase === "scanning") s.stop("Repo scanned.")
    else if (lastPhase === "synthesizing") s.stop("Articles synthesized.")
    else if (lastPhase === "writing") s.stop("Articles generated!")
  }
  try {
    await generateFromRepo({
      projectDir,
      repoPath,
      model,
      authToken,
      onPhase: (phase, detail) => {
        stopCurrent()
        lastPhase = phase
        if (phase === "scanning") {
          s.start(`Scanning ${pc.cyan(repoPath)}...`)
        } else if (phase === "synthesizing") {
          s.start(`Synthesizing articles with ${pc.dim(model)}${detail ? pc.dim(` (${detail})`) : ""}...`)
        } else if (phase === "writing") {
          // Defer sample-content clear until right before writes.
          clearSampleContent(projectDir)
          s.start("Writing articles...")
        }
      },
    })
    stopCurrent()
    return true
  } catch (err) {
    if (lastPhase !== null) {
      s.stop(pc.yellow("Couldn't generate articles. Sample content shipped with the scaffold remains."))
    }
    printRepoGenerationFallbackHint(err, repoPath)
    return false
  }
}

function detectPackageManager(): string {
  const userAgent = process.env.npm_config_user_agent ?? ""
  if (userAgent.startsWith("pnpm")) return "pnpm"
  if (userAgent.startsWith("yarn")) return "yarn"
  if (userAgent.startsWith("bun")) return "bun"
  return "npm"
}

/**
 * Spawn `<pkgManager> install` as a background child process and resolve
 * once it exits. Captures stdout + stderr into buffers (not piped to the
 * terminal) so it doesn't interleave with the spinner owned by AI
 * generation. On non-zero exit we keep the last 500 chars of stderr so
 * the manual-retry note gives a real reason.
 *
 * 2-minute timeout matches the previous `execSync` behavior — slow CI
 * networks occasionally hit it, but 3min+ is almost always a cold Docker
 * image pulling the registry for the first time, not a normal user run.
 */
function runInstallInBackground(
  projectDir: string,
  pkgManager: string,
): Promise<{ success: true } | { success: false; reason: string }> {
  return new Promise((resolve) => {
    let stderrTail = ""
    const child = spawn(pkgManager, ["install"], {
      cwd: projectDir,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120000,
    })
    child.stdout?.on("data", () => {
      // drain to keep the pipe flowing; output is intentionally dropped
    })
    child.stderr?.on("data", (chunk: Buffer) => {
      // Retain only the tail — package managers can be very chatty, and
      // we only surface the reason on failure.
      stderrTail = (stderrTail + chunk.toString()).slice(-500)
    })
    child.once("error", (err) => {
      resolve({ success: false, reason: err.message })
    })
    child.once("exit", (code) => {
      if (code === 0) {
        resolve({ success: true })
      } else {
        const reason = stderrTail.trim() || `${pkgManager} install exited ${code}`
        resolve({ success: false, reason })
      }
    })
  })
}

/**
 * Write generated articles into `<projectDir>/content/<category>/*.mdx` and
 * scaffold the matching `_category.json` files. URL branch only — the repo
 * branch writes via generateFromRepo (shared context-writer path).
 */
function writeArticlesToContentDir(
  projectDir: string,
  articles: Awaited<ReturnType<typeof generateArticlesFromContent>>,
): void {
  const contentDir = path.join(projectDir, "content")
  fs.mkdirSync(contentDir, { recursive: true })

  const plans = planArticleWrites(articles, contentDir)
  const categoriesWritten = new Set<string>()

  for (const plan of plans) {
    const categoryDir = path.join(contentDir, plan.categorySlug)
    fs.mkdirSync(categoryDir, { recursive: true })

    if (!categoriesWritten.has(plan.categorySlug)) {
      fs.writeFileSync(
        path.join(categoryDir, "_category.json"),
        JSON.stringify(
          {
            title: plan.categoryTitle,
            description: "",
            icon: "file-text",
            order: 1,
          },
          null,
          2,
        ),
      )
      categoriesWritten.add(plan.categorySlug)
    }

    fs.writeFileSync(plan.filePath, plan.mdx)
  }
}

function printGenerationFallbackHint(err: unknown, url: string): void {
  if (err instanceof MissingApiKeyError) {
    note(
      `Run ${pc.cyan("helpbase login")} (free, no card) then:\n` +
      `  ${pc.cyan(`helpbase generate --url ${url}`)}\n\n` +
      `Or bring your own key: ${pc.cyan("ANTHROPIC_API_KEY")}, ${pc.cyan("OPENAI_API_KEY")}, or ${pc.cyan("AI_GATEWAY_API_KEY")} ` +
      `(docs: ${pc.cyan("helpbase.dev/guides/byok")})`,
      "AI generation skipped",
    )
    return
  }
  if (err instanceof GatewayError) {
    note(
      `Gateway error: ${err.message}\n` +
      `Retry with ${pc.cyan(`helpbase generate --url ${url} --test`)} to use a cheap fallback model.`,
      "AI generation failed",
    )
    return
  }
  note(
    `Run ${pc.cyan(`helpbase generate --url ${url}`)} later to retry.`,
    "Tip",
  )
}

/**
 * Minimal POSIX shell-quote for user-facing copy/paste commands. Avoids
 * adding an `shell-quote` dep for a single call site. Returns the string
 * unchanged when it only contains safe characters; otherwise wraps it in
 * single quotes and escapes embedded single quotes via the `'\''` idiom.
 *
 * Relevant for `printRepoGenerationFallbackHint` below: a user who runs
 * `create-helpbase` from `/Users/foo/my docs` needs the retry hint to
 * print `helpbase ingest '/Users/foo/my docs'` — unquoted, the copy/paste
 * breaks on the space.
 */
function quoteShellArg(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function printRepoGenerationFallbackHint(err: unknown, repoPath: string): void {
  const quotedRepoPath = quoteShellArg(repoPath)
  if (err instanceof MissingApiKeyError) {
    note(
      `Run ${pc.cyan("helpbase login")} (free, no card) then:\n` +
      `  ${pc.cyan(`helpbase ingest ${quotedRepoPath}`)}\n\n` +
      `Or bring your own key: ${pc.cyan("ANTHROPIC_API_KEY")}, ${pc.cyan("OPENAI_API_KEY")}, or ${pc.cyan("AI_GATEWAY_API_KEY")} ` +
      `(docs: ${pc.cyan("helpbase.dev/guides/byok")})`,
      "AI generation skipped",
    )
    return
  }
  if (err instanceof TokenBudgetExceededError) {
    note(
      `${err.message}\n` +
      `Point at a subdirectory with more focused content, or run:\n` +
      `  ${pc.cyan(`helpbase ingest ${quotedRepoPath} --max-tokens 200000`)} after scaffold.`,
      "Repo is too large",
    )
    return
  }
  if (err instanceof SchemaGenerationError) {
    note(
      `The model returned invalid output. Retry with ${pc.cyan("--model anthropic/claude-sonnet-4.6")}.`,
      "Model output issue",
    )
    return
  }
  if (err instanceof AllDocsDroppedError) {
    note(
      `The model returned ${err.rawDocCount} article(s) but citation validation dropped all of them. ` +
        `This is common on cheap models that paraphrase quoted code.\n\n` +
        `Retry with:\n` +
        `  ${pc.cyan(`helpbase ingest ${quotedRepoPath} --model anthropic/claude-sonnet-4.6`)}\n` +
        `after scaffold to regenerate with a stronger model.`,
      "All articles dropped",
    )
    return
  }
  if (err instanceof GatewayError) {
    note(
      `Gateway error: ${err.message}\n` +
      `Retry with ${pc.cyan(`helpbase ingest ${quotedRepoPath} --test`)} after scaffold to use a cheap fallback model.`,
      "AI generation failed",
    )
    return
  }
  note(
    `Run ${pc.cyan(`helpbase ingest ${quotedRepoPath}`)} later to retry.`,
    "Tip",
  )
}

/**
 * Result shape for runHelpbaseDeploy. On failure we surface the last
 * non-empty output line so the "Deploy failed" note can name the cause
 * without asking the user to scroll up through several screens of clack
 * box-drawing. The deploy subprocess stdout/stderr is tee'd — user sees
 * the live output AND we keep a rolling tail for the failure path.
 */
type DeployOutcome = { kind: "ok" } | { kind: "failed"; errorTail: string }

/**
 * Spawn `helpbase deploy` in the scaffolded project dir. Stdin is
 * inherited so clack prompts inside deploy still render. Stdout/stderr
 * are piped + tee'd so the user sees output live AND we capture the
 * trailing 500 bytes of each stream. On non-zero exit we return the
 * last non-empty line of stderr (falling back to stdout) as errorTail
 * so the failure note can be self-contained.
 *
 * Uses the same package-manager detection + `dlx`/`npx` fallback as
 * runHelpbaseLogin so first-time users without a global helpbase install
 * still get the binary resolved for them.
 */
async function runHelpbaseDeploy(projectDir: string): Promise<DeployOutcome> {
  const pkgManager = detectPackageManager()
  const [cmd, ...args] =
    pkgManager === "pnpm"
      ? ["pnpm", "dlx", "helpbase@latest", "deploy"]
      : pkgManager === "yarn"
        ? ["yarn", "dlx", "helpbase@latest", "deploy"]
        : pkgManager === "bun"
          ? ["bunx", "helpbase@latest", "deploy"]
          : ["npx", "-y", "helpbase@latest", "deploy"]

  return new Promise<DeployOutcome>((resolve) => {
    let stdoutTail = ""
    let stderrTail = ""
    const child = spawn(cmd, args, {
      stdio: ["inherit", "pipe", "pipe"],
      cwd: projectDir,
      env: process.env,
    })
    child.stdout?.on("data", (chunk: Buffer) => {
      process.stdout.write(chunk)
      stdoutTail = (stdoutTail + chunk.toString()).slice(-500)
    })
    child.stderr?.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk)
      stderrTail = (stderrTail + chunk.toString()).slice(-500)
    })
    const lastMeaningfulLine = (): string => {
      const tail = (stderrTail.trim() || stdoutTail.trim())
        // Strip ANSI color codes so the quoted line reads cleanly in our note.
        .replace(/\x1b\[[0-9;]*m/g, "")
      const lines = tail.split("\n").map((l) => l.trim()).filter(Boolean)
      return lines[lines.length - 1] ?? "no error output captured"
    }
    child.on("exit", (code) => {
      if (code === 0) resolve({ kind: "ok" })
      else resolve({ kind: "failed", errorTail: lastMeaningfulLine() })
    })
    child.on("error", (err) =>
      resolve({ kind: "failed", errorTail: err.message }),
    )
  })
}

/**
 * Run `helpbase login` as a subprocess with stdio inherited so the user
 * sees the real login prompt (email → OTP). Returns "ok" if the login
 * flow exited cleanly, "failed" if the subprocess crashed / was cancelled.
 *
 * Uses `npx helpbase@latest` as the spawn target so this works even when
 * the user has no global helpbase install and the scaffolder itself was
 * launched via `pnpm dlx create-helpbase@latest`. First-run resolution
 * is ~10-20s; subsequent runs hit the npx cache and are near-instant.
 */
async function runHelpbaseLogin(): Promise<"ok" | "failed"> {
  const pkgManager = detectPackageManager()
  // Prefer the package manager the user invoked create-helpbase with
  // (matches their cache behavior). Fall back to npx if unknown.
  const [cmd, ...args] =
    pkgManager === "pnpm"
      ? ["pnpm", "dlx", "helpbase@latest", "login"]
      : pkgManager === "yarn"
        ? ["yarn", "dlx", "helpbase@latest", "login"]
        : pkgManager === "bun"
          ? ["bunx", "helpbase@latest", "login"]
          : ["npx", "-y", "helpbase@latest", "login"]

  return new Promise<"ok" | "failed">((resolve) => {
    const child = spawn(cmd, args, {
      stdio: "inherit",
      env: process.env,
    })
    child.on("exit", (code) => resolve(code === 0 ? "ok" : "failed"))
    child.on("error", () => resolve("failed"))
  })
}

/**
 * Spawn `<pkgManager> dev` as a background process, tail stdout for the
 * Next.js "Ready in XXXms" signal, and fire the user's default browser
 * the moment it appears. The user sees the magical moment (cited docs at
 * localhost:3000) without having to click the terminal link.
 *
 * Waits for the server to stay alive — returns when the child exits, so
 * the CLI doesn't return to the shell while the user is reading.
 */
async function startDevServerWithAutoOpen(
  pkgManager: string,
  projectDir: string,
): Promise<void> {
  const [cmd, ...args] = pkgManager === "npm" ? ["npm", "run", "dev"] : [pkgManager, "dev"]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const child = spawn(cmd as any, args, {
    cwd: projectDir,
    stdio: ["inherit", "pipe", "pipe"],
    env: process.env,
  })

  let browserOpened = false
  const openBrowserOnce = (url: string) => {
    if (browserOpened) return
    browserOpened = true
    try {
      const openCmd =
        process.platform === "darwin"
          ? "open"
          : process.platform === "win32"
          ? "start"
          : "xdg-open"
      // Spawn detached so we don't hold the browser open on CLI exit.
      spawn(openCmd, [url], { detached: true, stdio: "ignore" }).unref()
    } catch {
      // best-effort — if open fails the user can click the terminal link
    }
  }

  const handleChunk = (chunk: Buffer) => {
    process.stdout.write(chunk)
    const text = chunk.toString("utf8")
    // Next.js 13+ prints the port it actually bound to (may not be 3000
    // if the port was taken). Match the "- Local:" line to get the
    // real URL, or fall back to "Ready in" + localhost:3000.
    const localMatch = text.match(/Local:\s+(https?:\/\/[^\s]+)/)
    if (localMatch && localMatch[1]) {
      openBrowserOnce(localMatch[1])
      return
    }
    if (/Ready in \d+/.test(text)) {
      openBrowserOnce("http://localhost:3000")
    }
  }

  child.stdout?.on("data", handleChunk)
  child.stderr?.on("data", (chunk: Buffer) => process.stderr.write(chunk))

  await new Promise<void>((resolve) => {
    child.on("exit", () => resolve())
    child.on("error", () => resolve())
  })
}
