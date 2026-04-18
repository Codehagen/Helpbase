import { Command } from "commander"
import pc from "picocolors"
import fs from "node:fs"
import path from "node:path"
import { execSync } from "node:child_process"
import matter from "gray-matter"

import { resolveModel, TEST_MODEL, GatewayError, MissingApiKeyError } from "@workspace/shared/ai"
import {
  readContextSources,
  totalChars,
} from "@workspace/shared/context-reader"
import {
  buildContextPrompt,
  buildLocalAskPrompt,
  generateHowtosFromRepo,
  articleToMdxWithCitations,
  enrichCitationsFromDisk,
  sanitizeMdx,
  estimateTokens,
  TokenBudgetExceededError,
  SchemaGenerationError,
} from "@workspace/shared/ai-context"
import {
  createFileCache,
  validateArticleCitations,
} from "@workspace/shared/citations"
import { scanForSecrets, formatSecretError } from "@workspace/shared/secrets"
import {
  inventoryExistingDocs,
  planContextWrites,
  atomicWriteFileSync,
  ensureGitignoreEntry,
} from "@workspace/shared/context-writer"
import {
  generateLlmsTxt,
  LLMS_FULL_MAX_BYTES,
} from "@workspace/shared/llms-txt"
import type { GeneratedContextDoc } from "@workspace/shared/schemas"
import { slugify } from "@workspace/shared/slugify"

import { HelpbaseError } from "../lib/errors.js"
import { contextError } from "./context-errors.js"
import { callLlmText } from "@workspace/shared/llm"
import { formatQuotaSuffix } from "@workspace/shared/llm-errors"
import { resolveAuthOrPromptLogin } from "../lib/inline-auth.js"
import { toCliLlmError } from "../lib/llm-errors-cli.js"

/**
 * Apply the full ingest option surface to a Command. Shared between
 * `ingestCommand` and the deprecated `contextCommand` (in context.ts) so
 * any flag added here is automatically available on `helpbase context`
 * while the shim is alive. Keeps the two surfaces in lockstep without
 * option-by-option duplication.
 */
export function applyIngestOptions(cmd: Command): Command {
  return cmd
    .argument("[repoPath]", "Path to the repo to ingest", ".")
    .option("-o, --output <dir>", "Output directory for generated content", ".helpbase")
    .option("--max-tokens <n>", "Token budget for the LLM input (per run)", "100000")
    .option(
      "--chars-per-token <n>",
      "Chars-per-token ratio used for the budget estimate (3.5 = mid-range; 2.8 for code-heavy, 4.2 for prose)",
      "3.5",
    )
    .option("--model <id>", "Override the model ID (e.g. anthropic/claude-sonnet-4.6)")
    .option("--test", `Use the cheap test model (${TEST_MODEL}) and print model info`)
    .option(
      "--debug",
      "Write the raw assembled prompt to <output>/_prompt.txt before calling the LLM",
    )
    .option("--dry-run", "Walk the repo and print what would be sent to the LLM, without spending tokens")
    .option("--allow-dirty", "Explicitly allow generating from a dirty working tree (default behavior; kept for clarity)")
    .option("--require-clean", "Exit 1 if the working tree has uncommitted changes (CI mode)")
    .option("--overwrite", "Overwrite existing docs, including source:custom (default preserves custom files)")
    .option("--yes", "Skip interactive confirmations (for CI/scripted use)")
    .option("--only <category>", "Only (re)generate docs in one category slug")
    .option("--prompt <file>", "Override the default prompt with a file path (content is still wrapped in untrusted-content delimiters)")
    .option("--ask <question>", "After generating, answer a question against the fresh docs in-terminal (no MCP client required)")
    .option("--reuse-existing", "With --ask: skip generation, answer against the existing .helpbase/docs/ on disk (for eval/batch runs)")
}

/**
 * Shared action handler for `helpbase ingest` and the deprecated
 * `helpbase context` alias. Wraps `runIngest` with the error-translation
 * layer (TokenBudget / Schema / Gateway / MissingApiKey → HelpbaseError).
 */
export async function runIngestAction(
  repoPathArg: string,
  opts: IngestOpts,
): Promise<void> {
  try {
    await runIngest(repoPathArg, opts)
  } catch (err) {
    if (err instanceof HelpbaseError) throw err
    // Translate hosted-proxy errors (AuthRequired/Quota/GlobalCap/Network/Gateway)
    // into HelpbaseError with per-code fix copy. Untranslated errors fall through.
    const llmWrapped = toCliLlmError(err, {
      retryCommand: `helpbase ingest ${repoPathArg}${opts.ask ? ` --ask ${JSON.stringify(opts.ask)}` : ""}`,
    })
    if (llmWrapped instanceof HelpbaseError) throw llmWrapped
    if (err instanceof MissingApiKeyError) throw contextError("E_CONTEXT_MISSING_KEY")
    if (err instanceof TokenBudgetExceededError) {
      const top = err.files
        .slice()
        .sort((a, b) => b.chars - a.chars)
        .slice(0, 10)
        .map((f) => `    ${f.path}  ${formatChars(f.chars)}`)
        .join("\n")
      throw contextError("E_CONTEXT_OVER_BUDGET", {
        cause: `Estimated ${err.estimatedTokens} tokens (cap ${err.maxTokens}). Biggest files:\n${top}`,
      })
    }
    if (err instanceof SchemaGenerationError) throw contextError("E_CONTEXT_SCHEMA")
    if (err instanceof GatewayError) {
      throw new HelpbaseError({
        code: "E_NETWORK",
        problem: "The LLM gateway call failed.",
        cause: err.message,
        fix: [
          "Retry in a moment — transient gateway errors are common.",
          "Check your AI_GATEWAY_API_KEY is valid.",
          "Try --model anthropic/claude-sonnet-4.6 to switch providers.",
        ],
      })
    }
    throw err
  }
}

export const ingestCommand = applyIngestOptions(
  new Command("ingest").description(
    "Turn a repo into agent-ready docs: walks your code + markdown, synthesizes cited how-to guides, wires up MCP. Your docs, always up to date.",
  ),
)
  .addHelpText(
    "after",
    `
Examples:
  $ helpbase ingest .                               # ingest current repo
  $ helpbase ingest ./path/to/repo                  # ingest a specific path
  $ helpbase ingest . --dry-run                     # preview without spending tokens
  $ helpbase ingest . --ask "how do I log in?"      # ingest + answer in terminal
  $ helpbase ingest . --only auth                   # regen just one category
  $ helpbase ingest . --require-clean               # fail if tree is dirty (CI mode)

Auth: run ${pc.cyan("helpbase login")} (free, 500k tokens/day, no card)
  OR export one of ${pc.cyan("ANTHROPIC_API_KEY")} / ${pc.cyan("OPENAI_API_KEY")} / ${pc.cyan("AI_GATEWAY_API_KEY")}
  (BYOK — first key found wins; --model overrides)
`,
  )
  .action(runIngestAction)

export interface IngestOpts {
  output: string
  maxTokens: string
  charsPerToken: string
  model?: string
  test?: boolean
  debug?: boolean
  dryRun?: boolean
  allowDirty?: boolean
  requireClean?: boolean
  overwrite?: boolean
  yes?: boolean
  only?: string
  prompt?: string
  ask?: string
  reuseExisting?: boolean
}

async function runIngest(repoPathArg: string, opts: IngestOpts): Promise<void> {
  // ─── 1. Resolve repo path ───────────────────────────────────────
  const repoRoot = path.resolve(process.cwd(), repoPathArg || ".")
  if (!fs.existsSync(repoRoot) || !fs.statSync(repoRoot).isDirectory()) {
    throw contextError("E_CONTEXT_REPO_PATH", {
      cause: `Resolved path: ${repoRoot}`,
    })
  }

  // ─── 1.5. --reuse-existing fast path (eval / batch --ask runs) ──
  // Skips the walk + LLM + validate + write pipeline entirely. Only
  // legal when paired with --ask, because there's no point reusing docs
  // if you're not asking a question. Reads existing .helpbase/docs and
  // hands them straight to runLocalAsk. Net effect for the eval runner:
  // one generate + N cheap --ask passes, instead of N+1 full regens.
  if (opts.reuseExisting) {
    if (!opts.ask) {
      throw contextError("E_CONTEXT_REUSE_WITHOUT_ASK")
    }
    const outputDir = path.resolve(repoRoot, opts.output || ".helpbase")
    const serialized = loadExistingDocs(outputDir)
    const model = resolveModel({ test: opts.test, modelOverride: opts.model })
    const auth = await resolveAuthOrPromptLogin({
      verb: "ask",
      retryCommand: `helpbase ingest --reuse-existing --ask ${JSON.stringify(opts.ask)}`,
    })
    await runLocalAsk(opts.ask, serialized, model, auth.authToken)
    return
  }

  // ─── 2. Dirty-tree check (warn-by-default, block only on --require-clean) ──
  checkDirtyTree(repoRoot, opts)

  // ─── 3. Walk sources ────────────────────────────────────────────
  const sources = readContextSources(repoRoot)
  if (sources.length === 0) {
    throw contextError("E_CONTEXT_NO_SOURCES", {
      cause: `Walked ${repoRoot} and found no eligible files.`,
    })
  }

  const outputDir = path.resolve(repoRoot, opts.output || ".helpbase")
  const docsDir = path.join(outputDir, "docs")
  const model = resolveModel({ test: opts.test, modelOverride: opts.model })
  const maxTokens = Number.parseInt(opts.maxTokens, 10) || 100000
  const charsPerToken = Number.parseFloat(opts.charsPerToken) || 3.5

  // ─── 5. Dry-run summary — no LLM call, no writes ────────────────
  if (opts.dryRun) {
    const estimated = estimateTokens(sources, charsPerToken)
    const preview = sources
      .slice(0, 10)
      .map((s) => `  ${s.path}  ${formatChars(s.content.length)}`)
      .join("\n")
    const tail =
      sources.length > 10 ? `\n  ...and ${sources.length - 10} more` : ""
    console.log("")
    console.log(`${pc.dim("›")} ${pc.bold("Dry run — no LLM call, no writes")}`)
    console.log(`  Repo:             ${pc.cyan(repoRoot)}`)
    console.log(`  Output:           ${pc.cyan(outputDir)}`)
    console.log(`  Model:            ${pc.cyan(model)}`)
    console.log(`  Sources found:    ${sources.length}`)
    console.log(`  Total chars:      ${formatChars(totalChars(sources))}`)
    console.log(`  Estimated tokens: ${estimated.toLocaleString()} (budget ${maxTokens.toLocaleString()})`)
    console.log(`  Sample sources:`)
    console.log(preview + tail)
    console.log("")
    console.log(`  ${pc.dim("Remove --dry-run to synthesize docs.")}`)
    return
  }

  // Project-name resolution: prefer package.json `name`, fall back to the
  // repo directory basename. Used for the LLM prompt ("You are documenting
  // X") and for llms.txt — so both surfaces agree. Without this, a repo in
  // a temp dir like /tmp/xyz123 tells the LLM it's documenting "xyz123"
  // even when package.json clearly says "todo-app".
  const repoLabel = resolveProjectName(repoRoot)

  // ─── 6. Debug prompt dump (optional) ────────────────────────────
  if (opts.debug) {
    const prompt = buildContextPrompt({ sources, repoLabel })
    fs.mkdirSync(outputDir, { recursive: true })
    const debugPath = path.join(outputDir, "_prompt.txt")
    fs.writeFileSync(debugPath, prompt)
    console.log(`${pc.dim("›")} Wrote prompt to ${pc.cyan(debugPath)}`)
  }

  // ─── 6.5. Auth resolution — BYOK env var OR helpbase session ──────
  const auth = await resolveAuthOrPromptLogin({
    verb: "ingest",
    retryCommand: `helpbase ingest ${repoPathArg}${opts.ask ? ` --ask ${JSON.stringify(opts.ask)}` : ""}`,
  })

  // ─── 7. LLM synthesis ───────────────────────────────────────────
  console.log(
    `${pc.dim("›")} Synthesizing how-tos from ${pc.bold(String(sources.length))} source files...`,
  )
  const startLlm = Date.now()
  const rawDocs = await generateHowtosFromRepo({
    sources,
    repoLabel,
    model,
    maxTokens,
    charsPerToken,
    authToken: auth.authToken,
  })
  const llmMs = Date.now() - startLlm
  console.log(
    `  ${pc.dim("›")} ${pc.bold(String(rawDocs.length))} draft docs in ${(llmMs / 1000).toFixed(1)}s`,
  )

  // ─── 8. Sanitize + validate citations ───────────────────────────
  const cache = createFileCache()
  const report: SynthesisReport = {
    startedAt: new Date().toISOString(),
    repoRoot,
    model,
    tokensEstimated: estimateTokens(sources, charsPerToken),
    durationMs: 0,
    kept: [],
    droppedDocs: [],
    preservedFiles: [],
    deletedFiles: [],
  }

  const kept: GeneratedContextDoc[] = []
  for (const rawDoc of rawDocs) {
    const sanitized: GeneratedContextDoc = {
      ...rawDoc,
      content: sanitizeMdx(rawDoc.content),
    }
    const v = validateArticleCitations(sanitized, repoRoot, cache)
    if (v.kept.length === 0) {
      report.droppedDocs.push({
        title: rawDoc.title,
        reason: "all citations failed validation",
        citations: v.dropped.map((d) => ({
          file: d.citation.file,
          startLine: d.citation.startLine,
          endLine: d.citation.endLine,
          reason: d.reason,
        })),
      })
      continue
    }
    if (v.dropped.length > 0) {
      report.droppedDocs.push({
        title: rawDoc.title,
        reason: `partial: ${v.dropped.length} of ${sanitized.citations.length} citations dropped; doc kept with remaining ${v.kept.length}`,
        citations: v.dropped.map((d) => ({
          file: d.citation.file,
          startLine: d.citation.startLine,
          endLine: d.citation.endLine,
          reason: d.reason,
        })),
      })
    }
    // v2 citations omit `snippet` — enrich from disk so MDX carries real
    // bytes, not model-paraphrased text. Reuses the validator's file cache.
    const enriched = enrichCitationsFromDisk(v.kept, repoRoot, cache)
    kept.push({ ...sanitized, citations: enriched })
    report.kept.push({
      title: sanitized.title,
      category: sanitized.category,
      citationCount: enriched.length,
    })
  }

  // ─── 9. Zero-doc guard ──────────────────────────────────────────
  if (kept.length === 0) {
    fs.mkdirSync(outputDir, { recursive: true })
    const reportPath = path.join(outputDir, "synthesis-report.json")
    report.durationMs = Date.now() - startLlm
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
    throw contextError("E_CONTEXT_NO_VALID_CITATIONS", {
      cause: `${rawDocs.length} docs emitted, 0 passed citation validation. See ${reportPath} for per-doc drop reasons.`,
    })
  }

  // ─── 10. Serialize to MDX strings ───────────────────────────────
  const serialized: Array<{ relPath: string; content: string; doc: GeneratedContextDoc }> = []
  kept.forEach((doc, idx) => {
    const catSlug = slugify(doc.category)
    const docSlug = slugify(doc.title)
    const relPath = `${catSlug}/${docSlug}.mdx`
    const content = articleToMdxWithCitations(doc, idx + 1)
    serialized.push({ relPath, content, doc })
  })

  // ─── 11. Pre-write secret scan (on EVERY final MDX string) ──────
  for (const s of serialized) {
    const matches = scanForSecrets(s.content)
    if (matches.length > 0) {
      const msg = formatSecretError(matches, s.relPath)
      process.stderr.write(msg + "\n")
      throw contextError("E_CONTEXT_SECRET", {
        cause: `Pattern "${matches[0]!.patternName}" matched in ${s.relPath}. No files were written.`,
      })
    }
  }

  // ─── 12. Inventory + plan writes ────────────────────────────────
  const existing = inventoryExistingDocs(docsDir)
  const planned = planContextWrites({
    newDocs: serialized.map(({ relPath, content }) => ({ relPath, content })),
    docsDir,
    existing,
    onlyCategory: opts.only ? slugify(opts.only) : undefined,
  })
  // --overwrite removes custom-file preservation.
  if (opts.overwrite && planned.preserves.length > 0) {
    // Don't silently clobber custom edits — require --yes as a second gate.
    if (!opts.yes) {
      process.stderr.write(
        `${pc.yellow("!")} --overwrite was set but --yes was not. Refusing to clobber ${planned.preserves.length} custom file(s). Pass --yes to confirm.\n`,
      )
      process.exit(1)
    }
    // Move preserves into writes so they get overwritten.
    // Build the serialized-by-rel index so we only overwrite custom files
    // that have a matching generated doc (otherwise nothing to overwrite with).
    const byRel = new Map(serialized.map((s) => [path.join(docsDir, s.relPath), s.content]))
    for (const p of planned.preserves) {
      const replacement = byRel.get(p)
      if (replacement) planned.writes.push({ absPath: p, content: replacement })
    }
  }
  report.preservedFiles = planned.preserves
  report.deletedFiles = planned.deletes

  // ─── 13. Execute writes atomically ──────────────────────────────
  const written: string[] = []
  try {
    for (const w of planned.writes) {
      atomicWriteFileSync(w.absPath, w.content)
      written.push(w.absPath)
    }
  } catch (err) {
    // Best-effort rollback: remove anything we wrote this run.
    for (const p of written) {
      try {
        fs.rmSync(p, { force: true })
      } catch {
        // best-effort only
      }
    }
    throw err
  }
  // Deletes come AFTER successful writes so a failed write doesn't lose stale generated files.
  for (const p of planned.deletes) {
    try {
      fs.rmSync(p, { force: true })
    } catch {
      // best-effort — a stale generated file left behind is not worth aborting
    }
  }

  // ─── 14. .gitignore safety ──────────────────────────────────────
  ensureGitignoreEntry(repoRoot, path.relative(repoRoot, outputDir))

  // ─── 14.5. Emit llms.txt + llms-full.txt ────────────────────────
  emitLlmsTxt(repoRoot, docsDir, outputDir)

  // ─── 14.7. Emit mcp.json config hint ────────────────────────────
  emitMcpJsonHint(outputDir, docsDir)

  // ─── 15. Synthesis report ───────────────────────────────────────
  fs.mkdirSync(outputDir, { recursive: true })
  report.durationMs = Date.now() - startLlm
  const reportPath = path.join(outputDir, "synthesis-report.json")
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))

  console.log(
    `  ${pc.dim("›")} Wrote ${pc.bold(String(planned.writes.length))} MDX files → ${pc.cyan(path.relative(repoRoot, docsDir))}`,
  )
  if (planned.preserves.length > 0) {
    console.log(
      `  ${pc.dim("›")} Preserved ${planned.preserves.length} custom file(s)`,
    )
  }
  if (planned.deletes.length > 0) {
    console.log(
      `  ${pc.dim("›")} Deleted ${planned.deletes.length} stale generated file(s)`,
    )
  }

  // ─── 16. --ask (local RAG, no MCP client required) ─────────────
  if (opts.ask) {
    await runLocalAsk(opts.ask, serialized, model, auth.authToken)
  } else {
    printNextSteps(repoPathArg || ".", outputDir)
  }
}

function printNextSteps(repoArg: string, outputDir: string): void {
  console.log("")
  console.log(pc.bold("Next:"))
  console.log(
    `  ${pc.dim("1. Open it in a browser:")} ${pc.cyan("helpbase preview")}`,
  )
  console.log(
    `  ${pc.dim("2. Try it in-terminal:")} ${pc.cyan(`helpbase ingest ${repoArg} --ask "how do I log in?"`)}`,
  )
  console.log(`  ${pc.dim("3. Share with an MCP client — copy a block from:")}`)
  console.log(`     ${pc.cyan(path.join(outputDir, "mcp.json"))}`)
  console.log(`     ${pc.dim("into your client's config file:")}`)
  for (const p of mcpClientConfigPaths()) {
    console.log(`       ${pc.dim("·")} ${p.client}: ${pc.cyan(p.path)}`)
  }
  console.log(
    `  ${pc.dim("4. Or browse")} ${pc.cyan(path.join(outputDir, "llms.txt"))} / ${pc.cyan(path.join(outputDir, "llms-full.txt"))} ${pc.dim("— standard llms.txt format")}`,
  )
  console.log("")
}

// ── Helpers ──────────────────────────────────────────────────────────

function checkDirtyTree(repoRoot: string, opts: IngestOpts): void {
  let dirtyLines = ""
  try {
    dirtyLines = execSync("git status --porcelain", {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim()
  } catch {
    // Not a git repo — silently skip the check.
    return
  }
  if (!dirtyLines) return
  const count = dirtyLines.split("\n").length
  if (opts.requireClean) {
    throw contextError("E_CONTEXT_DIRTY_TREE", {
      cause: `${count} uncommitted file(s) detected.`,
    })
  }
  // Default + --allow-dirty: warn and continue.
  process.stderr.write(
    `${pc.yellow("!")} Working tree has ${count} uncommitted change(s). Continuing — pass --require-clean for CI-mode.\n`,
  )
}

/**
 * Resolve the project's display name.
 *
 * Preferred: `package.json` `name` field. Fallback: the repo directory's
 * basename. A repo cloned into a temp path shouldn't leak "tmp-ax89z" into
 * user-visible output — package.json is the user's intent, the path is an
 * implementation detail.
 */
export function resolveProjectName(repoRoot: string): string {
  const pkgPath = path.join(repoRoot, "package.json")
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"))
      if (typeof pkg.name === "string" && pkg.name.trim().length > 0) {
        return pkg.name.trim()
      }
    } catch {
      // fall through to the basename
    }
  }
  return path.basename(repoRoot)
}

function emitLlmsTxt(repoRoot: string, docsDir: string, outputDir: string): void {
  const projectName = resolveProjectName(repoRoot)
  let projectSummary: string | undefined
  let siteUrl: string | undefined = process.env.HELPBASE_SITE_URL
  const pkgPath = path.join(repoRoot, "package.json")
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"))
      if (typeof pkg.description === "string" && pkg.description)
        projectSummary = pkg.description
      if (!siteUrl && typeof pkg.homepage === "string" && pkg.homepage)
        siteUrl = pkg.homepage
    } catch {
      // fall back to defaults
    }
  }
  if (!projectSummary) {
    projectSummary = `Docs for ${projectName}, generated by helpbase ingest.`
  }

  const { llmsTxt, llmsFullTxt, docCount, fullBytes } = generateLlmsTxt({
    contentDir: docsDir,
    projectName,
    projectSummary,
    siteUrl,
  })

  fs.writeFileSync(path.join(outputDir, "llms.txt"), llmsTxt, "utf-8")
  fs.writeFileSync(path.join(outputDir, "llms-full.txt"), llmsFullTxt, "utf-8")

  if (!siteUrl) {
    process.stderr.write(
      `${pc.dim("›")} HELPBASE_SITE_URL not set; llms.txt uses relative URLs. Set the env var or add "homepage" to package.json for absolute links.\n`,
    )
  }
  if (fullBytes > LLMS_FULL_MAX_BYTES) {
    process.stderr.write(
      `${pc.yellow("!")} llms-full.txt is ${(fullBytes / 1024 / 1024).toFixed(1)}MB (over ${LLMS_FULL_MAX_BYTES / 1024 / 1024}MB sanity cap).\n`,
    )
  }
  // Intentionally silent on the happy path — the next-steps block
  // surfaces the paths; no need for a per-file console log.
  void docCount
}

function emitMcpJsonHint(outputDir: string, docsDir: string): void {
  // The mcp.json file is NOT a config the MCP server consumes — it's a
  // hint for the user. They copy one of the blocks into their client's
  // config file (paths listed after this function runs).
  //
  // HELPBASE_CONTENT_DIR = absolute path to the generated docs dir. Uses
  // path.resolve(opts.output, "docs") so --output overrides work.
  const mcpServerBlock = {
    command: "npx",
    args: ["@helpbase/mcp@latest"],
    env: {
      HELPBASE_CONTENT_DIR: docsDir,
    },
  }
  const hint = {
    _comment:
      "This file is a HINT — copy one of the blocks below into your MCP client's config. Do NOT commit: HELPBASE_CONTENT_DIR is an absolute machine-local path.",
    helpbaseMcpVersion: "1",
    claude_desktop: { mcpServers: { helpbase: mcpServerBlock } },
    cursor: { mcpServers: { helpbase: mcpServerBlock } },
    claude_code: { mcpServers: { helpbase: mcpServerBlock } },
  }
  fs.writeFileSync(
    path.join(outputDir, "mcp.json"),
    JSON.stringify(hint, null, 2) + "\n",
    "utf8",
  )
}

function mcpClientConfigPaths(): Array<{ client: string; path: string }> {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "~"
  const isWindows = process.platform === "win32"
  if (isWindows) {
    const appData = process.env.APPDATA ?? `${home}\\AppData\\Roaming`
    return [
      { client: "Claude Desktop", path: `${appData}\\Claude\\claude_desktop_config.json` },
      { client: "Cursor", path: `${home}\\.cursor\\mcp.json` },
      { client: "Claude Code", path: `${home}\\.claude\\mcp.json` },
    ]
  }
  const isMac = process.platform === "darwin"
  const claudeDesktop = isMac
    ? `${home}/Library/Application Support/Claude/claude_desktop_config.json`
    : `${home}/.config/Claude/claude_desktop_config.json`
  return [
    { client: "Claude Desktop", path: claudeDesktop },
    { client: "Cursor", path: `${home}/.cursor/mcp.json` },
    { client: "Claude Code", path: `${home}/.claude/mcp.json` },
  ]
}

function formatChars(n: number): string {
  if (n < 1000) return `${n}b`
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}Kb`
  return `${(n / 1_000_000).toFixed(1)}Mb`
}

interface SynthesisReport {
  startedAt: string
  repoRoot: string
  model: string
  tokensEstimated: number
  durationMs: number
  kept: Array<{ title: string; category: string; citationCount: number }>
  droppedDocs: Array<{
    title: string
    reason: string
    citations: Array<{ file: string; startLine: number; endLine: number; reason: string }>
  }>
  preservedFiles: string[]
  deletedFiles: string[]
}

// ── --reuse-existing: load docs from disk into runLocalAsk shape ─────

/**
 * Walk `.helpbase/docs/` for existing MDX files and reconstruct the
 * `serialized`-shape array that `runLocalAsk` consumes. Used by the
 * `--reuse-existing --ask` fast path so the eval runner can do one
 * expensive generation and many cheap question passes instead of N+1
 * full regens.
 */
function loadExistingDocs(
  outputDir: string,
): Array<{ relPath: string; content: string; doc: GeneratedContextDoc }> {
  const docsDir = path.join(outputDir, "docs")
  if (!fs.existsSync(docsDir)) {
    throw contextError("E_CONTEXT_REUSE_EMPTY", {
      cause: `No directory at ${docsDir}.`,
    })
  }
  const results: Array<{ relPath: string; content: string; doc: GeneratedContextDoc }> = []
  // docs/<category>/<slug>.mdx — two-level walk, not recursive globbing.
  for (const categoryDir of fs.readdirSync(docsDir, { withFileTypes: true })) {
    if (!categoryDir.isDirectory()) continue
    const catPath = path.join(docsDir, categoryDir.name)
    for (const entry of fs.readdirSync(catPath, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".mdx")) continue
      const full = path.join(catPath, entry.name)
      const content = fs.readFileSync(full, "utf8")
      const parsed = matter(content)
      // Minimal reconstruction — runLocalAsk uses title from doc, body
      // from parsed content. Extra fields kept so the shape is valid.
      const doc: GeneratedContextDoc = {
        title: String(parsed.data.title ?? entry.name),
        description: String(parsed.data.description ?? ""),
        category: categoryDir.name,
        tags: Array.isArray(parsed.data.tags) ? parsed.data.tags : [],
        content: parsed.content,
        citations: Array.isArray(parsed.data.citations) ? parsed.data.citations : [],
        sourcePaths: [],
      }
      results.push({
        relPath: path.join(categoryDir.name, entry.name),
        content,
        doc,
      })
    }
  }
  if (results.length === 0) {
    throw contextError("E_CONTEXT_REUSE_EMPTY")
  }
  return results
}

// ── Local --ask (the magical-moment fix) ─────────────────────────────

async function runLocalAsk(
  question: string,
  serialized: Array<{ relPath: string; content: string; doc: GeneratedContextDoc }>,
  model: string,
  authToken?: string,
): Promise<void> {
  // Ask against just the generated body (not frontmatter), since the model
  // doesn't need to see YAML. Pass the slug path so it can cite correctly.
  const docs = serialized.map((s) => {
    const parsed = matter(s.content)
    return {
      title: s.doc.title,
      path: s.relPath,
      body: parsed.content,
    }
  })
  const prompt = buildLocalAskPrompt({ question, docs })
  console.log("")
  console.log(`${pc.dim("›")} Answering: ${pc.bold(JSON.stringify(question))}`)
  const started = Date.now()
  let text: string
  let quotaForWarning: ReturnType<typeof formatQuotaSuffix> | null = null
  try {
    const result = await callLlmText({ model, prompt, authToken })
    text = result.text
    if (result.quota) {
      const pct = Math.round((result.quota.usedToday / result.quota.dailyLimit) * 100)
      if (pct >= 80) {
        quotaForWarning = formatQuotaSuffix(result.quota)
      }
    }
  } catch (err) {
    throw toCliLlmError(err, {
      retryCommand: `helpbase ingest --ask ${JSON.stringify(question)}`,
    })
  }
  const ms = Date.now() - started
  console.log("")
  console.log(text)
  console.log("")
  console.log(`  ${pc.dim(`answered in ${(ms / 1000).toFixed(1)}s using ${model}`)}`)
  if (quotaForWarning) {
    console.log(`  ${pc.yellow("heads-up:")} ${quotaForWarning}`)
  }
}
