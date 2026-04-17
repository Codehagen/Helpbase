#!/usr/bin/env node

import { intro, outro, text, select, confirm, spinner, note, cancel, isCancel } from "@clack/prompts"
import { Command } from "commander"
import pc from "picocolors"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
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
import { isByokMode } from "@workspace/shared/llm"
import {
  generateFromRepo,
  AllDocsDroppedError,
  TokenBudgetExceededError,
  SchemaGenerationError,
} from "./generate-from-repo.js"
import { emitMcpJson } from "./emit-mcp-json.js"

interface RunOptions {
  url?: string
  source?: string
  install?: boolean
  open?: boolean
  test?: boolean
  model?: string
  internal?: boolean
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
  .version("0.0.1")
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

  // 2. Content source selection.
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

  // 3. Auth resolution — conditional on existing state.
  //    Skip entirely when the user already has a helpbase session on disk
  //    or any BYOK env var set (ANTHROPIC_API_KEY / OPENAI_API_KEY /
  //    AI_GATEWAY_API_KEY via isByokMode()).
  //    Otherwise offer a single confirm — the target persona (YC founder
  //    with no key) always picks "log in free," so a 3-way select was
  //    cognitive noise. BYOK users route via env var before running;
  //    paste-a-key was removed to cut prompt count for the common path.
  let authToken = readHelpbaseAuthToken()
  if (isInteractive && source.kind !== "skip" && !authToken && !isByokMode()) {
    const wantsLogin = await confirm({
      message: "Log in to helpbase free? (500k tokens/day, no card — 30s browser flow)",
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
          `Couldn't run helpbase login. Falling back to sample content. Run ${pc.cyan("npx helpbase@latest login")} after scaffold to retry.`,
          "Login skipped",
        )
      } else {
        // Re-read the token file — login just wrote it.
        authToken = readHelpbaseAuthToken()
      }
    }
    // Declined → fall through with no token, generation will error with
    // the MissingApiKey path and the scaffolded sample content stays.
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

  // 8. Done!
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

  note(
    `${pc.cyan("npx helpbase context .")}                 ${pc.dim("generate docs from your repo source")}\n` +
    `${pc.cyan("npx helpbase deploy")}                    ${pc.dim("go live at <slug>.helpbase.dev")}\n` +
    `${pc.cyan("npx helpbase new")}                       ${pc.dim("add a new article interactively")}`,
    "What next",
  )

  outro(
    `${pc.green("Your help center is ready!")}\n` +
    `  Docs: ${pc.dim("https://helpbase.dev/docs")}`,
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
  spinner: ReturnType<typeof spinner>
}): Promise<boolean> {
  const { projectDir, url, model, spinner: s } = opts
  try {
    s.start(`Scraping ${pc.cyan(url)}...`)
    const content = await scrapeUrl(url)
    s.stop("Site scraped.")

    s.start(`Synthesizing articles with ${pc.dim(model)} ${pc.dim("(~10-25s)")}...`)
    const articles = await generateArticlesFromContent({
      content,
      sourceUrl: url,
      model,
      authToken: readHelpbaseAuthToken(),
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
      `(docs: ${pc.cyan("helpbase.dev/docs/byok")})`,
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

function printRepoGenerationFallbackHint(err: unknown, repoPath: string): void {
  if (err instanceof MissingApiKeyError) {
    note(
      `Run ${pc.cyan("helpbase login")} (free, no card) then:\n` +
      `  ${pc.cyan(`helpbase context ${repoPath}`)}\n\n` +
      `Or bring your own key: ${pc.cyan("ANTHROPIC_API_KEY")}, ${pc.cyan("OPENAI_API_KEY")}, or ${pc.cyan("AI_GATEWAY_API_KEY")} ` +
      `(docs: ${pc.cyan("helpbase.dev/docs/byok")})`,
      "AI generation skipped",
    )
    return
  }
  if (err instanceof TokenBudgetExceededError) {
    note(
      `${err.message}\n` +
      `Point at a subdirectory with more focused content, or run:\n` +
      `  ${pc.cyan(`helpbase context ${repoPath} --max-tokens 200000`)} after scaffold.`,
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
        `  ${pc.cyan(`helpbase context ${repoPath} --model anthropic/claude-sonnet-4.6`)}\n` +
        `after scaffold to regenerate with a stronger model.`,
      "All articles dropped",
    )
    return
  }
  if (err instanceof GatewayError) {
    note(
      `Gateway error: ${err.message}\n` +
      `Retry with ${pc.cyan(`helpbase context ${repoPath} --test`)} after scaffold to use a cheap fallback model.`,
      "AI generation failed",
    )
    return
  }
  note(
    `Run ${pc.cyan(`helpbase context ${repoPath}`)} later to retry.`,
    "Tip",
  )
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
