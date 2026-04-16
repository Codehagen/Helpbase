/**
 * Context-specific repo reader for `helpbase context`.
 *
 * Different from `readRepoContent` (which concatenates markdown into one
 * string and silently truncates at 200k chars): this one returns a list
 * of per-file sources with lineCount and extension preserved, so the
 * caller can enforce a token budget and reject over-budget runs with
 * an accurate file-list error.
 *
 * Reads markdown (.md, .mdx, .markdown) + selected code extensions so
 * synthesized how-tos can cite actual code (e.g. `src/routes/auth.ts`).
 * Markdown-only readers cannot produce code citations, which was the
 * blocker Codex flagged at plan review.
 *
 * Honors the same skip list as the markdown walker and the same secret
 * deny-list. CRLF is normalized to LF on read so the citation validator
 * (which also normalizes) sees consistent line numbers across platforms.
 */

import fs from "node:fs"
import path from "node:path"

import { isSecretFile } from "./secrets.js"

export interface ContextSource {
  /** Repo-relative POSIX-style path (what goes into citations). */
  path: string
  /** File contents, CRLF-normalized. Capped at `MAX_FILE_BYTES`. */
  content: string
  /** Number of \n-separated lines in `content`. */
  lineCount: number
  /** Lowercase extension including the leading dot, e.g. ".ts". */
  ext: string
}

export interface ReadContextSourcesOptions {
  /**
   * Extensions to include. Defaults to markdown + a conservative set of
   * common code file types. Callers (or a future `--include-ext` flag)
   * can override. Pass ".*" for "any text file" (not recommended — will
   * pick up lockfiles).
   */
  extensions?: string[]
  /**
   * Max bytes read from a single file. Oversized files are replaced with
   * a placeholder so the LLM sees their existence but not their contents.
   * Guards against a pathological 5MB README dominating the prompt.
   */
  maxFileBytes?: number
}

/** Default extensions — markdown plus the most common code file types. */
export const DEFAULT_CONTEXT_EXTENSIONS = [
  // Docs
  ".md",
  ".mdx",
  ".markdown",
  // TypeScript / JavaScript
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  // Other popular languages
  ".py",
  ".go",
  ".rs",
  ".rb",
  ".java",
  ".kt",
  ".swift",
  ".php",
] as const

/** Default per-file byte cap. 100KB is plenty for almost any hand-written file. */
export const DEFAULT_MAX_FILE_BYTES = 100 * 1024

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".next",
  ".turbo",
  ".vercel",
  ".cache",
  "coverage",
  ".helpbase",
  // Lockfile-shaped bulk that has no signal for how-to synthesis.
  "vendor",
])

export function readContextSources(
  repoRoot: string,
  opts?: ReadContextSourcesOptions,
): ContextSource[] {
  const exts = new Set(
    (opts?.extensions ?? DEFAULT_CONTEXT_EXTENSIONS).map((e) => e.toLowerCase()),
  )
  const maxBytes = opts?.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES

  const repoAbs = path.resolve(repoRoot)
  const sources: ContextSource[] = []
  const stack: string[] = [repoAbs]

  while (stack.length) {
    const current = stack.pop()!
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      // Hide dotfiles except known skip-list names (.git, .next, etc. are
      // excluded via SKIP_DIR_NAMES below; unknown dotfiles are excluded
      // here to avoid leaking .env / .npmrc / .ssh / .aws accidentally).
      if (entry.name.startsWith(".")) {
        if (entry.isDirectory() && !SKIP_DIR_NAMES.has(entry.name)) continue
        if (!entry.isDirectory()) continue
      }
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIR_NAMES.has(entry.name)) continue
        stack.push(full)
        continue
      }
      if (!entry.isFile()) continue
      // Gate 1: secret-named files never enter the LLM context.
      if (isSecretFile(entry.name)) continue
      const ext = path.extname(entry.name).toLowerCase()
      if (!exts.has(ext)) continue

      const rel = path.relative(repoAbs, full).split(path.sep).join("/")
      let rawBuf: Buffer
      try {
        rawBuf = fs.readFileSync(full)
      } catch {
        continue
      }

      if (rawBuf.byteLength > maxBytes) {
        const placeholder = `// [file too large, skipped: ${rawBuf.byteLength} bytes > ${maxBytes}B cap]`
        process.stderr.write(
          `[helpbase-context] Skipping ${rel} (${rawBuf.byteLength} bytes > ${maxBytes}B cap)\n`,
        )
        sources.push({
          path: rel,
          content: placeholder,
          lineCount: 1,
          ext,
        })
        continue
      }

      // CRLF → LF so citation line numbers match across platforms.
      const content = rawBuf.toString("utf8").replace(/\r\n/g, "\n")
      const lineCount = content.length === 0 ? 0 : content.split("\n").length
      sources.push({ path: rel, content, lineCount, ext })
    }
  }

  // Stable order: README-ish first, then shallower paths, then alpha.
  // Mirrors the heuristic `readRepoContent` uses so the LLM sees the
  // project overview before implementation details.
  sources.sort((a, b) => {
    const aBase = a.path.split("/").pop()!.toLowerCase()
    const bBase = b.path.split("/").pop()!.toLowerCase()
    const aReadme = aBase.startsWith("readme.")
    const bReadme = bBase.startsWith("readme.")
    if (aReadme !== bReadme) return aReadme ? -1 : 1
    const aDepth = a.path.split("/").length
    const bDepth = b.path.split("/").length
    if (aDepth !== bDepth) return aDepth - bDepth
    return a.path.localeCompare(b.path)
  })

  return sources
}

/** Total character count across all sources (used for the token budget). */
export function totalChars(sources: ContextSource[]): number {
  let total = 0
  for (const s of sources) total += s.content.length
  return total
}
