import fs from "node:fs"
import path from "node:path"
import matter from "gray-matter"

export interface Doc {
  slug: string
  category: string
  title: string
  description: string
  filePath: string
  content: string
}

export interface CategoryMeta {
  slug: string
  title: string
  order: number
}

const CONTENT_DIR_CANDIDATES = [
  "apps/web/content",
  "content",
]

/**
 * Find the content directory.
 *
 * Resolution order:
 *   1. HELPBASE_CONTENT_DIR env var (absolute or relative to cwd)
 *   2. Walk up from cwd looking for `apps/web/content/` (monorepo shape)
 *   3. Walk up from cwd looking for `content/` (flat shape)
 *
 * Returns an absolute path. Throws if nothing is found — callers should let this
 * bubble up with a clear message rather than silently serving an empty index.
 */
export function findContentDir(startDir: string = process.cwd()): string {
  const envOverride = process.env.HELPBASE_CONTENT_DIR
  if (envOverride && envOverride.length > 0) {
    const resolved = path.isAbsolute(envOverride)
      ? envOverride
      : path.resolve(startDir, envOverride)
    if (!fs.existsSync(resolved)) {
      throw new Error(
        `HELPBASE_CONTENT_DIR points at ${resolved} but that directory does not exist.`,
      )
    }
    return resolved
  }

  let dir = path.resolve(startDir)
  const root = path.parse(dir).root
  while (true) {
    for (const candidate of CONTENT_DIR_CANDIDATES) {
      const full = path.join(dir, candidate)
      if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
        return full
      }
    }
    if (dir === root) break
    dir = path.dirname(dir)
  }

  throw new Error(
    `Could not find a content directory. Looked for ${CONTENT_DIR_CANDIDATES.join(" or ")} walking up from ${startDir}. Set HELPBASE_CONTENT_DIR to point at your docs folder.`,
  )
}

function deriveTitle(rawTitle: unknown, fallbackSlug: string): string {
  if (typeof rawTitle === "string" && rawTitle.trim().length > 0) {
    return rawTitle.trim()
  }
  return fallbackSlug
    .split("-")
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ")
}

function deriveDescription(rawDesc: unknown): string {
  if (typeof rawDesc === "string") return rawDesc.trim()
  return ""
}

/**
 * Load all docs from the content directory.
 *
 * Shape expected:
 *   <content-dir>/<category-slug>/<doc-slug>.mdx
 *
 * Files prefixed with `_` are skipped (convention for _category.json, etc.).
 * Only .mdx and .md files are loaded.
 */
export function loadDocs(contentDir: string): Doc[] {
  if (!fs.existsSync(contentDir)) return []

  const docs: Doc[] = []
  const categoryDirs = fs
    .readdirSync(contentDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .filter((d) => !d.name.startsWith("_"))

  for (const dir of categoryDirs) {
    const categorySlug = dir.name
    const categoryPath = path.join(contentDir, categorySlug)
    const files = fs
      .readdirSync(categoryPath)
      .filter((f) => !f.startsWith("_"))
      .filter((f) => f.endsWith(".mdx") || f.endsWith(".md"))

    for (const file of files) {
      const filePath = path.join(categoryPath, file)
      const slug = file.replace(/\.mdx?$/, "")

      // Skip unreadable or malformed files with a stderr warning instead of
      // crashing the server. A single bad frontmatter should not take down the
      // MCP stream. Mirrors apps/web/lib/content.ts's lenient-in-dev posture.
      let raw: string
      try {
        raw = fs.readFileSync(filePath, "utf-8")
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        process.stderr.write(
          `[helpbase-mcp] Skipping ${categorySlug}/${file}: read failed (${msg})\n`,
        )
        continue
      }

      let parsed: ReturnType<typeof matter>
      try {
        parsed = matter(raw)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        process.stderr.write(
          `[helpbase-mcp] Skipping ${categorySlug}/${file}: malformed frontmatter (${msg})\n`,
        )
        continue
      }

      const { data, content } = parsed
      docs.push({
        slug,
        category: categorySlug,
        title: deriveTitle(data["title"], slug),
        description: deriveDescription(data["description"]),
        filePath: path.relative(contentDir, filePath),
        content: content.trim(),
      })
    }
  }

  docs.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category)
    return a.slug.localeCompare(b.slug)
  })

  return docs
}

/**
 * Load category metadata (title, order) from `_category.json` files.
 * Missing files are fine — we derive a sensible default.
 */
export function loadCategories(contentDir: string): CategoryMeta[] {
  if (!fs.existsSync(contentDir)) return []

  const categories: CategoryMeta[] = []
  const dirs = fs
    .readdirSync(contentDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .filter((d) => !d.name.startsWith("_"))

  for (const dir of dirs) {
    const metaPath = path.join(contentDir, dir.name, "_category.json")
    let title = deriveTitle(undefined, dir.name)
    let order = 999
    if (fs.existsSync(metaPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(metaPath, "utf-8"))
        if (typeof parsed.title === "string") title = parsed.title
        if (typeof parsed.order === "number") order = parsed.order
      } catch {
        // Malformed _category.json — use defaults, don't fail.
      }
    }
    categories.push({ slug: dir.name, title, order })
  }

  categories.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order
    return a.slug.localeCompare(b.slug)
  })
  return categories
}
