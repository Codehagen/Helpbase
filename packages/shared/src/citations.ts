/**
 * Citation validator for `helpbase ingest` (formerly `context`).
 *
 * Every generated how-to doc cites 1–5 specific file/line-range tuples.
 * This module verifies each citation against the repo on disk:
 *
 *   1. The cited path stays inside the repo root (no `../../etc/passwd`).
 *   2. The line range is valid (1 ≤ startLine ≤ endLine ≤ file line count).
 *   3. If a legacy `snippet` field is present (v1 committed docs), the
 *      whitespace-normalized snippet must appear in the cited slice. v2
 *      citations omit `snippet`; the CLI fills it from disk via readSnippet
 *      after validation, so paraphrase drift is impossible by construction.
 *
 * A doc whose citations fully fail is dropped; a doc with some valid is
 * kept with only the passing citations. Disk is never read more than once
 * per file per run — callers pass in a `CitationFileCache` so N citations
 * into the same file cost one `readFileSync`, not N.
 */

import fs from "node:fs"
import path from "node:path"

import type { ContextCitation } from "./schemas.js"

/** Per-run file content cache. Key = absolute resolved path. */
export type CitationFileCache = Map<string, string>

export function createFileCache(): CitationFileCache {
  return new Map()
}

/**
 * Normalize whitespace for snippet comparison. Collapses runs of any
 * whitespace (including normalized newlines) to a single space and trims
 * the ends. Intentionally case-sensitive — a snippet that differs in case
 * is probably a hallucination.
 */
export function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim()
}

/**
 * Read a cited file relative to the repo root, cached for the run.
 * Rejects any resolved path that escapes the repo root (`../` traversal,
 * absolute paths outside, symlinks that point outside).
 */
export function readFileForCitation(
  repoRoot: string,
  relPath: string,
  cache: CitationFileCache,
): { ok: true; content: string } | { ok: false; reason: string } {
  const repoAbs = path.resolve(repoRoot)
  // Resolve via realpath when possible so a symlink-out-of-repo is caught.
  const joined = path.resolve(repoAbs, relPath)
  let resolved: string
  try {
    resolved = fs.realpathSync(joined)
  } catch {
    // File doesn't exist — not a traversal error, but can't validate.
    return { ok: false, reason: `file not found: ${relPath}` }
  }
  const resolvedRepoRoot = (() => {
    try {
      return fs.realpathSync(repoAbs)
    } catch {
      return repoAbs
    }
  })()
  // Require `resolved` to be a descendant of the repo root.
  const rel = path.relative(resolvedRepoRoot, resolved)
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return { ok: false, reason: `citation path escapes the repo root: ${relPath}` }
  }
  // Cache hit?
  const cached = cache.get(resolved)
  if (cached !== undefined) return { ok: true, content: cached }
  // Read + CRLF normalize so citation line numbers match whether the file
  // was saved on Windows or Unix.
  let raw: string
  try {
    raw = fs.readFileSync(resolved, "utf8")
  } catch (err) {
    return {
      ok: false,
      reason: `failed to read ${relPath}: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
  const normalized = raw.replace(/\r\n/g, "\n")
  cache.set(resolved, normalized)
  return { ok: true, content: normalized }
}

export interface ValidateResult {
  ok: boolean
  reason?: string
}

/**
 * Read the bytes of a cited line range from disk. 1-based inclusive on
 * both ends, matching the citation schema. Returns null if the file can't
 * be read or the line range is out of bounds — callers treat null as
 * "drop this citation" and log the reason (surfaced via validateCitation).
 *
 * Path safety + CRLF normalization reuse readFileForCitation so disk
 * access goes through the same guard and cache.
 */
export function readSnippet(
  repoRoot: string,
  relPath: string,
  startLine: number,
  endLine: number,
  cache: CitationFileCache,
): string | null {
  const read = readFileForCitation(repoRoot, relPath, cache)
  if (!read.ok) return null
  const lines = read.content.split("\n")
  if (startLine < 1 || startLine > lines.length) return null
  if (endLine < startLine || endLine > lines.length) return null
  return lines.slice(startLine - 1, endLine).join("\n")
}

/**
 * Validate a single citation against the repo.
 *
 * v2 contract: bounds-check the line range against the file on disk.
 * Legacy v1 citations carrying a literal `snippet` field also get the
 * whitespace-normalized substring check, so existing committed `.helpbase/`
 * content keeps validating after the CLI upgrade.
 */
export function validateCitation(
  repoRoot: string,
  citation: ContextCitation,
  cache: CitationFileCache,
): ValidateResult {
  const read = readFileForCitation(repoRoot, citation.file, cache)
  if (!read.ok) return { ok: false, reason: read.reason }
  const lines = read.content.split("\n")
  if (citation.startLine < 1 || citation.startLine > lines.length) {
    return {
      ok: false,
      reason: `startLine ${citation.startLine} out of range (file has ${lines.length} lines)`,
    }
  }
  if (citation.endLine > lines.length) {
    return {
      ok: false,
      reason: `endLine ${citation.endLine} out of range (file has ${lines.length} lines)`,
    }
  }
  if (citation.endLine < citation.startLine) {
    return { ok: false, reason: `endLine < startLine` }
  }
  // v1 legacy path: if the model shipped a `snippet`, keep enforcing the
  // literal-text check so old committed docs don't silently degrade. v2
  // citations omit `snippet` and the bounds check above is sufficient.
  if (citation.snippet && citation.snippet.length > 0) {
    const slice = lines.slice(citation.startLine - 1, citation.endLine).join("\n")
    const haystack = normalizeWhitespace(slice)
    const needle = normalizeWhitespace(citation.snippet)
    if (!haystack.includes(needle)) {
      return {
        ok: false,
        reason: `snippet not found in ${citation.file}:${citation.startLine}-${citation.endLine}`,
      }
    }
  }
  return { ok: true }
}

export interface CitedArticle {
  citations: ContextCitation[]
}

export interface DroppedCitation {
  citation: ContextCitation
  reason: string
}

export interface ArticleValidationResult {
  kept: ContextCitation[]
  dropped: DroppedCitation[]
}

/**
 * Validate all citations on an article. Returns the subset that passed
 * ("kept") and the failures with reasons ("dropped"). Callers decide what
 * to do with a 0-kept article (ingest.ts drops it entirely and writes the
 * reason to `.helpbase/synthesis-report.json`).
 */
export function validateArticleCitations(
  article: CitedArticle,
  repoRoot: string,
  cache: CitationFileCache,
): ArticleValidationResult {
  const kept: ContextCitation[] = []
  const dropped: DroppedCitation[] = []
  for (const c of article.citations) {
    const r = validateCitation(repoRoot, c, cache)
    if (r.ok) kept.push(c)
    else dropped.push({ citation: c, reason: r.reason ?? "unknown" })
  }
  return { kept, dropped }
}
