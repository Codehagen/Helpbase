/**
 * Codebase-grounded doc sync: propose MDX edits from a code diff.
 *
 * The pipeline mirrors the `generate`/`ai-text` shape, with one critical
 * difference: the schema (`syncProposalsSchema`) rejects any proposal that
 * lacks citations into the source code. That is the anti-hallucination
 * gate. The LLM cannot write docs out of thin air — every edit must point
 * at specific lines of the diff that justify it.
 *
 * Architecture:
 *
 *   git diff (code changes) ──┐
 *                             ├──▶ callGenerator() ──▶ [Zod: SyncProposal[]]
 *   existing MDX (content) ──┘      (schema rejects   ──▶ apply locally
 *                                   zero-citation)     ──▶ unified diff
 *
 * Consumer: `helpbase sync` CLI command in packages/cli.
 */

import { callGenerator } from "./ai.js"
import {
  syncProposalsSchema,
  type SyncProposal,
} from "./schemas.js"

/**
 * A source MDX doc as seen by the prompt builder.
 *
 *   path    — repo-relative, e.g. "docs/guides/auth.mdx"
 *   content — full raw MDX (including frontmatter if any)
 */
export interface SyncMdxFile {
  path: string
  content: string
}

export interface GenerateSyncProposalsOptions {
  /** Full unified-diff text of the code changes to consider. */
  codeDiff: string
  /** Existing MDX docs that might need updates. */
  mdxFiles: SyncMdxFile[]
  /** Model id (provider/model), resolved by the CLI via resolveModel(). */
  model: string
  /**
   * Optional cap on how many MDX files are included verbatim in the prompt.
   * Large doc sets get summarized down to path + first 500 chars.
   * Default: 20 full files, rest truncated.
   */
  maxFullFiles?: number
}

/**
 * Hard cap on MDX bytes sent to the LLM. Past this, newer/larger files are
 * truncated to their first 2000 chars. Keeps token cost bounded on repos
 * with hundreds of doc pages.
 */
const MAX_MDX_BYTES = 200_000

/** Hard cap on diff bytes. Past this, the diff is truncated with a marker. */
const MAX_DIFF_BYTES = 100_000

export function buildSyncPrompt(opts: {
  codeDiff: string
  mdxFiles: SyncMdxFile[]
  maxFullFiles?: number
}): string {
  const { codeDiff, mdxFiles } = opts
  const maxFullFiles = opts.maxFullFiles ?? 20

  const diffSlice =
    codeDiff.length > MAX_DIFF_BYTES
      ? codeDiff.slice(0, MAX_DIFF_BYTES) +
        `\n\n[diff truncated — original was ${codeDiff.length} bytes, showing first ${MAX_DIFF_BYTES}]\n`
      : codeDiff

  const mdxSections: string[] = []
  let bytesUsed = 0
  for (let i = 0; i < mdxFiles.length; i++) {
    const f = mdxFiles[i]!
    const full = i < maxFullFiles && bytesUsed + f.content.length < MAX_MDX_BYTES
    const body = full ? f.content : f.content.slice(0, 2000)
    bytesUsed += body.length
    mdxSections.push(
      `### FILE: ${f.path}${full ? "" : " (truncated)"}\n\n${body}`,
    )
  }

  return [
    "You are a senior technical writer reviewing a code change to decide",
    "which documentation pages, if any, need updating. You are NOT writing",
    "new docs from scratch — you are proposing targeted edits to existing",
    "MDX files that are now inaccurate because of the code change.",
    "",
    "STRICT RULES:",
    "1. Every proposal MUST include at least one citation into the source",
    "   code diff. A citation is an object with sourceFile, lineStart,",
    "   lineEnd. If you cannot point at specific lines, do NOT propose the",
    "   change — omit it.",
    "2. `before` must be an exact substring of the current MDX file. The",
    "   CLI applies proposals via literal find-and-replace. If `before` is",
    "   not in the file byte-for-byte, the proposal is skipped.",
    "3. Only propose edits to content that is factually affected by the",
    "   diff. Style/typo/tone changes are out of scope.",
    "4. If the diff does not affect any existing doc, return an empty",
    "   proposals array. That is a valid, expected outcome.",
    "",
    "=== CODE DIFF ===",
    "",
    diffSlice,
    "",
    "=== EXISTING MDX DOCS ===",
    "",
    mdxSections.join("\n\n") || "(no MDX files provided)",
    "",
    "=== OUTPUT ===",
    "",
    "Return JSON matching the schema: { proposals: SyncProposal[] }.",
    "Empty array is a valid answer when no docs need updating.",
  ].join("\n")
}

/**
 * Result of a sync generation pass.
 *
 *   accepted  — proposals that passed schema validation
 *   rejected  — count of proposals the model returned that failed schema
 *               validation (almost always: missing citations). The CLI
 *               surfaces this count so users know the gate caught something.
 */
export interface SyncGenerationResult {
  accepted: SyncProposal[]
  rejected: number
}

export async function generateSyncProposals(
  opts: GenerateSyncProposalsOptions,
): Promise<SyncGenerationResult> {
  const prompt = buildSyncPrompt({
    codeDiff: opts.codeDiff,
    mdxFiles: opts.mdxFiles,
    maxFullFiles: opts.maxFullFiles,
  })

  const raw = await callGenerator<{ proposals: unknown[] }>({
    model: opts.model,
    prompt,
    schema: syncProposalsSchema,
  })

  // callGenerator returns schema-validated output; `raw.proposals` is
  // already typed as SyncProposal[] at runtime. The "rejected" count for
  // happy-path object-mode is always 0 because generateObject enforces the
  // schema. The count becomes non-zero when we add a future text-mode
  // fallback (each item validated individually). Surface it now so the
  // CLI UI does not need to change later.
  const result = syncProposalsSchema.safeParse(raw)
  if (!result.success) {
    // Shouldn't happen: generateObject should have already enforced. If it
    // does, treat every proposal as rejected (zero accepted).
    return { accepted: [], rejected: Array.isArray(raw?.proposals) ? raw.proposals.length : 0 }
  }
  return { accepted: result.data.proposals, rejected: 0 }
}

/**
 * Apply a proposal to the file's current content via literal find-and-replace.
 *
 * Returns:
 *   { ok: true, content }   — `before` was found and replaced
 *   { ok: false, reason }   — `before` not in file (proposal is stale)
 */
export function applyProposal(
  currentContent: string,
  proposal: SyncProposal,
):
  | { ok: true; content: string }
  | { ok: false; reason: "before-not-found" | "before-ambiguous" } {
  if (!currentContent.includes(proposal.before)) {
    return { ok: false, reason: "before-not-found" }
  }
  // If `before` appears multiple times, the replacement is ambiguous. The
  // LLM should have included enough context to make `before` unique; if it
  // didn't, skip rather than guess.
  const first = currentContent.indexOf(proposal.before)
  const second = currentContent.indexOf(
    proposal.before,
    first + proposal.before.length,
  )
  if (second !== -1) {
    return { ok: false, reason: "before-ambiguous" }
  }
  return { ok: true, content: currentContent.replace(proposal.before, proposal.after) }
}

/**
 * Render a single-file unified diff for a proposal. Minimal format — not
 * a full `diff -u` implementation. Output is good enough for git apply and
 * for display in a PR body. Callers needing full context should render the
 * resulting file contents with their own diff tool.
 */
export function renderProposalDiff(
  originalContent: string,
  proposal: SyncProposal,
): string {
  const applied = applyProposal(originalContent, proposal)
  if (!applied.ok) return `# skipped: ${proposal.file} (${applied.reason})`

  const beforeLines = proposal.before.split("\n")
  const afterLines = proposal.after.split("\n")
  const header = [
    `--- a/${proposal.file}`,
    `+++ b/${proposal.file}`,
    `@@ proposal @@`,
  ]
  const minus = beforeLines.map((l) => `-${l}`)
  const plus = afterLines.map((l) => `+${l}`)
  return [...header, ...minus, ...plus].join("\n")
}
