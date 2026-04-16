/**
 * Inventory-aware write planner for `helpbase context`.
 *
 * `planArticleWrites` (in ai.ts) blindly maps articles to target paths and
 * knows nothing about previously generated content or user-edited custom
 * files. For context, regen must:
 *   - preserve files whose frontmatter says `source: custom`
 *   - replace files whose frontmatter says `source: generated`
 *   - delete stale generated files (previous run had them; this run doesn't)
 *   - leave anything else alone
 *
 * This module does the inventory + diffing in pure code so the context
 * command's action handler reads top-to-bottom.
 */

import fs from "node:fs"
import path from "node:path"
import matter from "gray-matter"

export interface ExistingDoc {
  /** Absolute path on disk. */
  absPath: string
  /** Path relative to `docsDir`, POSIX-style. */
  relPath: string
  /** Frontmatter source field. `undefined` = legacy doc written before v1. */
  source?: "generated" | "custom"
}

/**
 * Scan `docsDir` for existing `.mdx` files and classify each by its
 * `source` frontmatter field. Missing source is treated as legacy —
 * the caller can choose to preserve or overwrite per policy (context
 * preserves).
 */
export function inventoryExistingDocs(docsDir: string): ExistingDoc[] {
  const results: ExistingDoc[] = []
  if (!fs.existsSync(docsDir)) return results
  const stack: string[] = [docsDir]
  while (stack.length) {
    const cur = stack.pop()!
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = path.join(cur, entry.name)
      if (entry.isDirectory()) {
        stack.push(full)
        continue
      }
      if (!entry.isFile()) continue
      if (!(entry.name.endsWith(".mdx") || entry.name.endsWith(".md"))) continue
      let raw: string
      try {
        raw = fs.readFileSync(full, "utf8")
      } catch {
        continue
      }
      let parsed: ReturnType<typeof matter>
      try {
        parsed = matter(raw)
      } catch {
        // Malformed frontmatter — treat as legacy (no source). Preserve.
        results.push({
          absPath: full,
          relPath: path.relative(docsDir, full).split(path.sep).join("/"),
        })
        continue
      }
      const source = parsed.data?.source
      results.push({
        absPath: full,
        relPath: path.relative(docsDir, full).split(path.sep).join("/"),
        source:
          source === "generated" || source === "custom" ? source : undefined,
      })
    }
  }
  return results
}

export interface PlannedWrite {
  /** Absolute path to write. */
  absPath: string
  /** Final MDX content (frontmatter + body). */
  content: string
}

export interface WritePlan {
  writes: PlannedWrite[]
  /** Absolute paths of generated files present before but absent now. */
  deletes: string[]
  /** Absolute paths of custom files that this plan does NOT touch. */
  preserves: string[]
}

export interface PlanContextWritesInput {
  /** Result of serializing each kept article via articleToMdxWithCitations. */
  newDocs: Array<{ relPath: string; content: string }>
  /** Where to write — typically `<output>/docs`. */
  docsDir: string
  /** Pre-read inventory (or pass [] on first run). */
  existing: ExistingDoc[]
  /**
   * Optional category filter (--only flag). When set, do NOT delete
   * generated files outside this category — partial runs shouldn't
   * nuke work outside their scope.
   */
  onlyCategory?: string
}

/**
 * Diff new docs against the existing inventory. Result:
 *
 *   writes    — new + replacement files
 *   deletes   — stale generated files not in the new set
 *   preserves — custom files untouched
 *
 * Caller performs the actual fs ops. `mkdir -p` is the caller's job too.
 */
export function planContextWrites({
  newDocs,
  docsDir,
  existing,
  onlyCategory,
}: PlanContextWritesInput): WritePlan {
  const newByRel = new Map<string, string>()
  for (const d of newDocs) newByRel.set(d.relPath, d.content)

  const writes: PlannedWrite[] = []
  const deletes: string[] = []
  const preserves: string[] = []

  for (const [rel, content] of newByRel) {
    writes.push({ absPath: path.join(docsDir, rel), content })
  }

  for (const ex of existing) {
    if (ex.source === "custom") {
      preserves.push(ex.absPath)
      continue
    }
    // Generated or legacy (no source field).
    const inNew = newByRel.has(ex.relPath)
    if (inNew) continue // will be overwritten by a `writes` entry
    // Not in new. Only mark for deletion if we own it.
    if (ex.source === "generated") {
      // If --only is set, only delete stale files in that category.
      if (onlyCategory) {
        const [cat] = ex.relPath.split("/")
        if (cat !== onlyCategory) continue
      }
      deletes.push(ex.absPath)
    } else {
      // Legacy file (no source field). Preserve to avoid clobbering
      // hand-written docs from before v1 shipped.
      preserves.push(ex.absPath)
    }
  }

  return { writes, deletes, preserves }
}

// ── Safety helpers (atomic write + gitignore append) ─────────────────

/**
 * Write a file atomically: write to `<path>.tmp`, rename into place.
 * Reduces the window where a partially-written file exists on disk.
 */
export function atomicWriteFileSync(absPath: string, content: string): void {
  fs.mkdirSync(path.dirname(absPath), { recursive: true })
  const tmp = `${absPath}.helpbase-tmp-${process.pid}`
  fs.writeFileSync(tmp, content, "utf8")
  fs.renameSync(tmp, absPath)
}

/**
 * Ensure a single line exists in `.gitignore`. Append-only + idempotent.
 * If `.gitignore` does not exist, creates it with just this entry.
 * If the line already appears (exact match after trim), no-op.
 */
export function ensureGitignoreEntry(repoRoot: string, entry: string): boolean {
  const ignorePath = path.join(repoRoot, ".gitignore")
  let raw = ""
  if (fs.existsSync(ignorePath)) {
    try {
      raw = fs.readFileSync(ignorePath, "utf8")
    } catch {
      return false
    }
  }
  const lines = raw.split("\n").map((l) => l.trim())
  if (lines.includes(entry.trim())) return false
  const suffix = raw.length === 0 ? entry + "\n" : (raw.endsWith("\n") ? "" : "\n") + entry + "\n"
  try {
    fs.writeFileSync(ignorePath, raw + suffix)
    return true
  } catch {
    return false
  }
}
