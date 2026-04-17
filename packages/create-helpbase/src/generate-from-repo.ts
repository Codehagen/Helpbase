import fs from "node:fs"
import path from "node:path"

import { readContextSources } from "@workspace/shared/context-reader"
import {
  generateHowtosFromRepo,
  articleToMdxWithCitations,
  enrichCitationsFromDisk,
  sanitizeMdx,
  TokenBudgetExceededError,
  SchemaGenerationError,
} from "@workspace/shared/ai-context"
import { validateArticleCitations, createFileCache } from "@workspace/shared/citations"
import { scanForSecrets, formatSecretError } from "@workspace/shared/secrets"
import {
  planContextWrites,
  atomicWriteFileSync,
} from "@workspace/shared/context-writer"
import { slugify } from "@workspace/shared/slugify"
import type { GeneratedContextDoc } from "@workspace/shared/schemas"

/**
 * Thrown when the LLM returns articles but every single one is dropped by
 * the citation validator. The caller (scaffolder) restores sample content
 * and shows an actionable error — retry on a stronger model, run
 * `helpbase context .` manually, etc.
 *
 * Separate class so the outer try/catch can distinguish "nothing to write"
 * from "LLM errored" or "missing auth" without string-matching.
 */
export class AllDocsDroppedError extends Error {
  constructor(public readonly rawDocCount: number) {
    super(
      `The model returned ${rawDocCount} articles but citation validation dropped all of them. ` +
        `This commonly happens on cheap models that paraphrase quoted code.`,
    )
    this.name = "AllDocsDroppedError"
  }
}

/** Which phase of generation is running — drives the scaffolder's three-stage spinner. */
export type GeneratePhase = "scanning" | "synthesizing" | "writing"

export interface GenerateFromRepoOptions {
  /** Absolute path to the scaffolded project (where `content/` will live). */
  projectDir: string
  /** Absolute path to the repo being synthesized from. */
  repoPath: string
  /** Model id (e.g. "google/gemini-3.1-flash-lite-preview"). */
  model: string
  /** Hosted-proxy session token (from ~/.helpbase/auth.json). Ignored when AI_GATEWAY_API_KEY is set. */
  authToken?: string
  /** Token budget for the LLM input. Throws `TokenBudgetExceededError` if exceeded. */
  maxTokens?: number
  /** Chars-per-token ratio for the estimate. 3.5 = mid-range, 2.8 = code-heavy. */
  charsPerToken?: number
  /**
   * Fires as each phase begins. The scaffolder hangs a spinner stage on each.
   * Optional — callers that don't need staged progress can omit it.
   */
  onPhase?: (phase: GeneratePhase, detail?: string) => void
}

export interface GenerateFromRepoResult {
  /** Number of MDX files written to content/. */
  articlesWritten: number
  /** Number of raw LLM docs dropped by the citation validator (some kept, some dropped). */
  docsPartiallyDropped: number
  /** List of `<categorySlug>` strings that got a _category.json scaffolded. */
  categoriesWritten: string[]
}

/**
 * Walk the repo, synthesize cited how-tos via the hosted LLM proxy (or
 * AI_GATEWAY_API_KEY BYOK), and write MDX files into
 * `<projectDir>/content/<category>/<slug>.mdx` plus `_category.json`
 * scaffolds that the Next.js sidebar consumes.
 *
 * Mirrors the `helpbase context` pipeline but targets the scaffolder's
 * human-facing layout (`content/`) instead of the agent-facing
 * `.helpbase/docs/` layout. Every pre-write invariant the CLI enforces
 * (citation validation, secret deny-list, MDX sanitization) runs here too.
 *
 * Throws:
 *   - `TokenBudgetExceededError` if the repo is too big for `maxTokens`
 *   - `SchemaGenerationError` if the LLM returns invalid JSON even after retry
 *   - `AllDocsDroppedError` if every doc fails citation validation
 *   - `MissingApiKeyError` (via the LLM layer) if no auth + no BYOK
 *   - `Error` from the secret scanner if any final MDX contains a known pattern
 */
export async function generateFromRepo(
  opts: GenerateFromRepoOptions,
): Promise<GenerateFromRepoResult> {
  const {
    projectDir,
    repoPath,
    model,
    authToken,
    maxTokens = 100_000,
    charsPerToken = 3.5,
    onPhase,
  } = opts

  const contentDir = path.join(projectDir, "content")

  // ── 1. Walk repo ─────────────────────────────────────────────────────
  onPhase?.("scanning")
  const sources = readContextSources(repoPath)
  if (sources.length === 0) {
    throw new Error(
      `No readable source files found in ${repoPath}. ` +
        `Expected .md/.mdx or common code files (.ts, .py, .go, ...).`,
    )
  }

  // ── 2. LLM synthesis (token budget enforced inside) ──────────────────
  onPhase?.("synthesizing", `~10-25s on ${model}`)
  const repoLabel = resolveRepoLabel(repoPath)
  const rawDocs = await generateHowtosFromRepo({
    sources,
    repoLabel,
    model,
    maxTokens,
    charsPerToken,
    authToken,
  })

  // ── 3. Per-doc: sanitize, validate citations, enrich from disk ───────
  const cache = createFileCache()
  const kept: GeneratedContextDoc[] = []
  let partiallyDropped = 0

  for (const rawDoc of rawDocs) {
    const sanitized: GeneratedContextDoc = {
      ...rawDoc,
      content: sanitizeMdx(rawDoc.content),
    }
    const v = validateArticleCitations(sanitized, repoPath, cache)
    if (v.kept.length === 0) continue
    if (v.dropped.length > 0) partiallyDropped++
    const enriched = enrichCitationsFromDisk(v.kept, repoPath, cache)
    kept.push({ ...sanitized, citations: enriched })
  }

  if (kept.length === 0) {
    throw new AllDocsDroppedError(rawDocs.length)
  }

  // ── 4. Serialize to MDX + pre-write secret scan ──────────────────────
  onPhase?.("writing")
  const serialized: Array<{ relPath: string; content: string; categoryTitle: string }> = []
  kept.forEach((doc, idx) => {
    const catSlug = slugify(doc.category)
    const docSlug = slugify(doc.title)
    const relPath = `${catSlug}/${docSlug}.mdx`
    const content = articleToMdxWithCitations(doc, idx + 1)
    serialized.push({ relPath, content, categoryTitle: doc.category })
  })
  for (const s of serialized) {
    const matches = scanForSecrets(s.content)
    if (matches.length > 0) {
      // Same policy as helpbase context: refuse to write any file if any
      // file would leak. Pattern name + line number only — never the secret.
      throw new Error(formatSecretError(matches, s.relPath))
    }
  }

  // ── 5. Plan + execute writes ─────────────────────────────────────────
  fs.mkdirSync(contentDir, { recursive: true })
  const planned = planContextWrites({
    newDocs: serialized.map(({ relPath, content }) => ({ relPath, content })),
    docsDir: contentDir,
    existing: [],
    onlyCategory: undefined,
  })
  const written: string[] = []
  try {
    for (const w of planned.writes) {
      atomicWriteFileSync(w.absPath, w.content)
      written.push(w.absPath)
    }
  } catch (err) {
    // Best-effort rollback — if mid-sequence write fails, remove any files
    // we managed to write before the error so the scaffold doesn't ship a
    // half-populated content/ dir.
    for (const p of written) {
      try {
        fs.rmSync(p, { force: true })
      } catch {
        // best-effort
      }
    }
    throw err
  }

  // ── 6. Emit _category.json per category (Next.js sidebar metadata) ──
  const categoriesWritten = new Set<string>()
  for (const s of serialized) {
    const [catSlug] = s.relPath.split("/")
    if (!catSlug || categoriesWritten.has(catSlug)) continue
    const categoryDir = path.join(contentDir, catSlug)
    fs.mkdirSync(categoryDir, { recursive: true })
    const metaPath = path.join(categoryDir, "_category.json")
    if (!fs.existsSync(metaPath)) {
      fs.writeFileSync(
        metaPath,
        JSON.stringify(
          {
            title: s.categoryTitle,
            description: "",
            icon: "file-text",
            order: categoriesWritten.size + 1,
          },
          null,
          2,
        ),
      )
    }
    categoriesWritten.add(catSlug)
  }

  return {
    articlesWritten: planned.writes.length,
    docsPartiallyDropped: partiallyDropped,
    categoriesWritten: [...categoriesWritten],
  }
}

/**
 * Prefer `package.json` name (matches helpbase context behavior) so the
 * LLM writes articles about "my-app" not "my-docs-test". Falls back to
 * the repo directory basename if package.json is missing or malformed.
 */
function resolveRepoLabel(repoPath: string): string {
  const pkgPath = path.join(repoPath, "package.json")
  try {
    const raw = fs.readFileSync(pkgPath, "utf-8")
    const parsed = JSON.parse(raw) as { name?: unknown }
    if (typeof parsed.name === "string" && parsed.name.length > 0) {
      return parsed.name
    }
  } catch {
    // fall through to basename
  }
  return path.basename(repoPath)
}

/** Re-export the walker error class so the scaffolder catch block can branch on it. */
export { TokenBudgetExceededError, SchemaGenerationError }
