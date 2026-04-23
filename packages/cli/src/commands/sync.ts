import { Command } from "commander"
import { execSync, spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import pc from "picocolors"
import {
  generateSyncProposals,
  renderProposalDiff,
  applyProposal,
  type SyncMdxFile,
} from "@workspace/shared/ai-sync"
import { resolveModel, MissingApiKeyError, GatewayError, TEST_MODEL } from "@workspace/shared/ai"
import type { SyncProposal } from "@workspace/shared/schemas"
import { HelpbaseError, formatError } from "../lib/errors.js"
import { spinner, ok, info, note, emit } from "../lib/ui.js"
import { resolveAuthOrPromptLogin } from "../lib/inline-auth.js"
import { toCliLlmError } from "../lib/llm-errors-cli.js"
import { findContentDir } from "../lib/content-dir.js"

/**
 * `helpbase sync` — codebase-grounded documentation updates.
 *
 * Flow:
 *   1. Collect a code diff since the last sync point (--since).
 *   2. Read every MDX file under the content dir (--content).
 *   3. Hand both to the LLM with a schema that REJECTS any proposal
 *      lacking citations into the source code (anti-hallucination gate).
 *   4. Apply accepted proposals via literal find-and-replace and emit
 *      a unified diff. The user reviews and commits.
 *
 * --demo: skip the LLM call, use a bundled fixture response. The "30
 *         seconds to magic" first-run experience locked by the DX review.
 */

interface SyncOptions {
  since?: string
  content?: string
  output?: string
  model?: string
  test?: boolean
  dryRun?: boolean
  demo?: boolean
  apply?: boolean
  yes?: boolean
}

export const syncCommand = new Command("sync")
  .description("Propose MDX edits grounded in a code diff (no writes by default)")
  .option("--since <rev>", "Git rev to diff against (default: origin/main or HEAD~10)")
  .option(
    "--content <dir>",
    "MDX content directory (auto-discovers apps/web/content/, content/docs/, content/ if unset)",
  )
  .option("-o, --output <file>", "Write the unified diff to this file instead of stdout")
  .option("--model <id>", "Override the model ID (e.g. anthropic/claude-sonnet-4.6)")
  .option("--test", `Use the cheap test model (${TEST_MODEL})`)
  .option("--dry-run", "Show what would be proposed without calling the LLM")
  .option("--demo", "Skip the LLM and render the bundled demo fixture (first-run magic)")
  .option("--apply", "Apply accepted proposals to the MDX files in-place")
  .option("--yes", "Skip interactive confirmations (for CI)")
  .addHelpText(
    "after",
    `
Examples:
  $ helpbase sync --demo                     # 30-second tour, no key required
  $ helpbase sync --since HEAD~5             # diff last 5 commits
  $ helpbase sync --since origin/main        # diff against tracking branch
  $ helpbase sync --apply                    # apply proposals in-place

Set AI_GATEWAY_API_KEY first — https://vercel.com/ai-gateway
`,
  )
  .action(async (opts: SyncOptions) => {
    const s = spinner()

    // ── Demo mode: zero-config first-run magic ───────────────────────
    if (opts.demo) {
      await runDemo(opts)
      return
    }

    // ── Resolve since / diff ────────────────────────────────────────
    const since = resolveSince(opts.since)
    let codeDiff: string
    try {
      codeDiff = getGitDiff(since)
    } catch (err) {
      // Classify: does this error mean "the rev doesn't resolve" (a legit
      // first-push / misconfig case) vs. something unexpected?
      // GitHub's zero-SHA on brand-new repo first-push emits "bad object",
      // `HEAD~N` beyond history emits "ambiguous argument", user typos
      // emit "unknown revision". Catch all three shapes.
      const isUnresolvedRev =
        err instanceof Error &&
        /unknown revision|bad revision|bad object|ambiguous argument/i.test(
          err.message,
        )
      if (isUnresolvedRev) {
        // In CI / non-interactive mode, an unresolvable rev typically
        // means "brand-new repo, nothing to sync against" — not a user
        // error. Exit 0 rather than failing every first-push workflow.
        // Interactive users still see the targeted error so they can fix
        // their --since arg.
        if (opts.yes) {
          emit(
            `Git could not resolve '${since}' (likely a brand-new repo with no prior commit) — nothing to sync.`,
          )
          return
        }
        throw new HelpbaseError({
          code: "E_INVALID_REV",
          problem: `Git could not resolve '${since}'`,
          cause: err.message,
          fix: [
            "Check `git log` and pass a rev that exists.",
            `Try: ${pc.cyan("helpbase sync --since HEAD~5")} for the last 5 commits.`,
          ],
        })
      }
      throw err
    }

    if (codeDiff.trim().length === 0) {
      // In non-interactive / CI mode, an empty diff is an expected state
      // (no code changed since last run) — not an error. Exit 0 so the
      // GitHub Action shows green rather than failing every scheduled
      // / empty-push run. Interactive users still see the full error
      // so they can course-correct their --since arg.
      //
      // Use emit() (stdout, never suppressed) rather than ok() — CI logs
      // gate on stdio.isTTY, so ok()'s canDecorate() check would swallow
      // the message in the exact environment this branch exists to serve.
      if (opts.yes) {
        emit(`No code changes since ${since} — nothing to sync.`)
        return
      }
      throw new HelpbaseError({
        code: "E_NO_HISTORY",
        problem: `No code changes found since ${since}`,
        cause: "Nothing to sync — either the rev is empty or it matches HEAD.",
        fix: [
          "Make some code changes first, then re-run.",
          `Or pass a different rev: ${pc.cyan("--since HEAD~10")}`,
        ],
      })
    }

    info(`Diffing against ${pc.cyan(since)} (${codeDiff.length.toLocaleString()} bytes)`)

    // ── Read MDX content ────────────────────────────────────────────
    // --content wins if passed. Otherwise auto-discover by walking up
    // from cwd trying apps/web/content/, content/docs/, content/ — keeps
    // the shipped workflow zero-config across the three common MDX
    // layouts (monorepo, MDX-in-subfolder, flat).
    let contentDir: string
    if (opts.content) {
      contentDir = path.resolve(process.cwd(), opts.content)
    } else {
      const discovered = findContentDir(process.cwd())
      if (!discovered) {
        throw new HelpbaseError({
          code: "E_NO_CONTENT",
          problem: "Could not find a docs directory",
          cause: `Looked for ${pc.cyan("apps/web/content/")}, ${pc.cyan("content/docs/")}, or ${pc.cyan("content/")} walking up from ${pc.cyan(process.cwd())}.`,
          fix: [
            `First-time setup? Install the full helpbase primitive: ${pc.cyan("pnpm dlx helpbase init")} (drops docs routes, starter MDX, MCP, and this workflow).`,
            `Already have docs? Point at them with ${pc.cyan("--content <path>")} (e.g. ${pc.cyan("--content docs/")}).`,
            `Or set ${pc.cyan("HELPBASE_CONTENT_DIR")} if your layout is uncommon.`,
          ],
        })
      }
      contentDir = discovered
    }
    const mdxFiles = readMdxFiles(contentDir)
    if (mdxFiles.length === 0) {
      throw new HelpbaseError({
        code: "E_NO_CONTENT",
        problem: `No MDX files found under ${pc.cyan(contentDir)}`,
        fix: [
          `Add at least one ${pc.cyan(".mdx")} or ${pc.cyan(".md")} file under that directory.`,
          `Or pass a different path: ${pc.cyan("--content <path>")}.`,
        ],
      })
    }
    info(`Reading ${pc.cyan(String(mdxFiles.length))} MDX file${mdxFiles.length === 1 ? "" : "s"} from ${contentDir}`)

    if (opts.dryRun) {
      note("")
      info(`${pc.bold("Dry run — no LLM call")}`)
      note(`  Rev:       ${since}`)
      note(`  Diff:      ${codeDiff.length.toLocaleString()} bytes`)
      note(`  MDX files: ${mdxFiles.length}`)
      note(`  Output:    ${opts.output ? path.resolve(process.cwd(), opts.output) : "stdout"}`)
      note("")
      note(`  Remove --dry-run to actually call the LLM.`)
      return
    }

    // ── Call LLM ────────────────────────────────────────────────────
    const model = resolveModel({ test: opts.test, modelOverride: opts.model })
    const auth = await resolveAuthOrPromptLogin({
      verb: "sync",
      retryCommand: "helpbase sync",
    })
    const startedAt = Date.now()
    s.start("Generating doc proposals with AI...")
    let result
    try {
      result = await generateSyncProposals({
        codeDiff,
        mdxFiles,
        model,
        authToken: auth.authToken,
      })
    } catch (err) {
      s.stop(pc.red("Failed"))
      const wrapped = toCliLlmError(err, { retryCommand: "helpbase sync" })
      if (wrapped instanceof HelpbaseError) throw wrapped
      if (err instanceof MissingApiKeyError) {
        throw new HelpbaseError({
          code: "E_AUTH_REQUIRED",
          problem: "Not signed in and no BYOK key set",
          cause: "helpbase sync calls an LLM to propose doc edits; it needs auth or a BYOK key.",
          fix: [
            `Run ${pc.cyan("helpbase login")} (free, no card), then re-run.`,
            `Or bring your own key: ${pc.cyan("ANTHROPIC_API_KEY")}, ${pc.cyan("OPENAI_API_KEY")}, or ${pc.cyan("AI_GATEWAY_API_KEY")} (first found wins).`,
            "Docs: https://helpbase.dev/guides/byok",
          ],
        })
      }
      if (err instanceof GatewayError) {
        throw new HelpbaseError({
          code: "E_LLM_GATEWAY",
          problem: "LLM gateway call failed",
          cause: err.message,
          fix: ["Check your network and retry in a moment.", "Try --test to use the cheap model."],
        })
      }
      throw err
    }
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
    s.stop(`Proposals generated in ${elapsed}s`)

    if (result.accepted.length === 0 && result.rejected === 0) {
      ok("No doc updates needed for this diff.")
      return
    }

    if (result.accepted.length === 0) {
      throw new HelpbaseError({
        code: "E_NO_CITATIONS",
        problem: "Every proposal the model returned failed the citation gate",
        cause: `${result.rejected} proposal(s) returned without valid source citations.`,
        fix: [
          "This usually means the prompt or model regressed. Re-run in a moment.",
          "If it keeps happening, open an issue with the diff that triggered it.",
        ],
      })
    }

    // ── Render diff ─────────────────────────────────────────────────
    const rendered = renderProposals(contentDir, result.accepted)
    const output = opts.output ? path.resolve(process.cwd(), opts.output) : null
    if (output) {
      fs.writeFileSync(output, rendered.text, "utf-8")
      ok(`Wrote ${pc.cyan(output)} (${rendered.applicable} applicable / ${rendered.skipped} stale)`)
    } else {
      process.stdout.write(rendered.text + "\n")
    }

    if (result.rejected > 0) {
      note("")
      note(`${pc.dim("›")} ${result.rejected} proposal(s) rejected by the citation gate (schema caught them).`)
    }

    // ── Apply in-place (opt-in) ─────────────────────────────────────
    if (opts.apply) {
      const applied = applyProposalsInPlace(contentDir, result.accepted)
      ok(`Applied ${applied} proposal${applied === 1 ? "" : "s"} in-place. Review with ${pc.cyan("git diff")}.`)
    }

    ok(`sync complete in ${elapsed}s`)
  })

// ── Helpers ───────────────────────────────────────────────────────────

function resolveSince(explicit: string | undefined): string {
  if (explicit) return explicit
  // Prefer the tracked remote branch, fall back to HEAD~10.
  try {
    execSync("git rev-parse --verify origin/main", { stdio: "pipe" })
    return "origin/main"
  } catch {
    return "HEAD~10"
  }
}

function getGitDiff(since: string): string {
  // Spawn git ourselves so stderr is visible on failure. execSync would
  // swallow the helpful "unknown revision" message.
  const result = spawnSync("git", ["diff", "--unified=3", since, "--"], {
    encoding: "utf-8",
    maxBuffer: 50 * 1024 * 1024,
  })
  if (result.status !== 0) {
    const stderr = result.stderr?.trim() || "git diff failed"
    throw new Error(stderr)
  }
  return result.stdout
}

function readMdxFiles(dir: string): SyncMdxFile[] {
  if (!fs.existsSync(dir)) return []
  const out: SyncMdxFile[] = []
  for (const entry of walk(dir)) {
    if (!entry.endsWith(".mdx") && !entry.endsWith(".md")) continue
    const rel = path.relative(process.cwd(), entry)
    out.push({ path: rel, content: fs.readFileSync(entry, "utf-8") })
  }
  return out
}

function* walk(dir: string): Generator<string> {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) yield* walk(full)
    else if (e.isFile()) yield full
  }
}

function renderProposals(
  contentDir: string,
  proposals: SyncProposal[],
): { text: string; applicable: number; skipped: number } {
  const chunks: string[] = []
  let applicable = 0
  let skipped = 0
  for (const p of proposals) {
    const filePath = path.resolve(process.cwd(), p.file)
    // Guard: only allow proposals to paths under the content dir. A rogue
    // model emitting `../../etc/passwd` should never be applied.
    const rel = path.relative(contentDir, filePath)
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      chunks.push(`# skipped: ${p.file} (outside content dir)`)
      skipped++
      continue
    }
    const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : ""
    const result = applyProposal(current, p)
    if (!result.ok) {
      chunks.push(`# skipped: ${p.file} (${result.reason})`)
      skipped++
      continue
    }
    applicable++
    chunks.push(renderProposalDiff(current, p))
    if (p.rationale) chunks.push(`# rationale: ${p.rationale}`)
    const citations = p.citations
      .map((c) => `${c.sourceFile}:${c.lineStart}-${c.lineEnd}`)
      .join(", ")
    chunks.push(`# citations: ${citations}`)
  }
  return { text: chunks.join("\n\n"), applicable, skipped }
}

function applyProposalsInPlace(
  contentDir: string,
  proposals: SyncProposal[],
): number {
  let applied = 0
  for (const p of proposals) {
    const filePath = path.resolve(process.cwd(), p.file)
    const rel = path.relative(contentDir, filePath)
    if (rel.startsWith("..") || path.isAbsolute(rel)) continue
    if (!fs.existsSync(filePath)) continue
    const current = fs.readFileSync(filePath, "utf-8")
    const result = applyProposal(current, p)
    if (!result.ok) continue
    fs.writeFileSync(filePath, result.content, "utf-8")
    applied++
  }
  return applied
}

// ── Demo mode ─────────────────────────────────────────────────────────

async function runDemo(_opts: SyncOptions): Promise<void> {
  const here = path.dirname(new URL(import.meta.url).pathname)
  // Fixture lives alongside the CLI package; the bundler copies it into
  // dist/fixtures/. See packages/cli/fixtures/demo-repo/.
  const candidates = [
    path.resolve(here, "../fixtures/demo-repo"),
    path.resolve(here, "../../fixtures/demo-repo"),
    path.resolve(here, "../../../fixtures/demo-repo"),
  ]
  const fixtureDir = candidates.find((c) => fs.existsSync(c))
  if (!fixtureDir) {
    throw new HelpbaseError({
      code: "E_NO_CONTENT",
      problem: "Demo fixture not found",
      cause: `Looked in: ${candidates.join(", ")}`,
      fix: [
        "Re-install helpbase: the fixture ships in the package.",
        "If developing locally, run `pnpm --filter helpbase build` first.",
      ],
    })
  }

  const proposalsPath = path.join(fixtureDir, "proposals.json")
  const proposals: SyncProposal[] = JSON.parse(fs.readFileSync(proposalsPath, "utf-8"))

  info(`Demo mode — using bundled fixture at ${pc.cyan(path.relative(process.cwd(), fixtureDir))}`)
  info(`No API key required. Second run will use your real diff + key.`)
  note("")

  // Render proposals directly (no file-apply check, fixture content is
  // self-consistent with the fixture MDX).
  const rendered = proposals
    .map((p) => {
      const mdxPath = path.join(fixtureDir, p.file)
      const current = fs.existsSync(mdxPath) ? fs.readFileSync(mdxPath, "utf-8") : p.before
      const diff = renderProposalDiff(current, p)
      const citations = p.citations
        .map((c) => `${c.sourceFile}:${c.lineStart}-${c.lineEnd}`)
        .join(", ")
      const rationale = p.rationale ? `\n# rationale: ${p.rationale}` : ""
      return `${diff}${rationale}\n# citations: ${citations}`
    })
    .join("\n\n")

  process.stdout.write(rendered + "\n")
  note("")
  ok(`Demo complete — ${proposals.length} proposal${proposals.length === 1 ? "" : "s"}, all citation-grounded.`)
  info(`Next: run ${pc.cyan("helpbase login")} (free) or export ${pc.cyan("ANTHROPIC_API_KEY")} / ${pc.cyan("OPENAI_API_KEY")} / ${pc.cyan("AI_GATEWAY_API_KEY")}, then ${pc.cyan("helpbase sync")} in your repo.`)
}
