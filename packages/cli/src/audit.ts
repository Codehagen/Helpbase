import fs from "node:fs"
import path from "node:path"
import matter from "gray-matter"

export interface AuditIssue {
  level: "error" | "warning"
  file: string
  message: string
}

export interface AuditResult {
  categoryCount: number
  articleCount: number
  issues: AuditIssue[]
}

/**
 * The complete set of MDX component names available in the helpbase palette.
 * Any JSX tag in MDX content whose name is not in this set (and not a
 * standard HTML element) is flagged as an error.
 */
export const VALID_MDX_COMPONENTS = new Set([
  "Callout",
  "Figure",
  "Video",
  "Steps",
  "Step",
  "Accordion",
  "AccordionItem",
  "Tabs",
  "Tab",
  "CardGroup",
  "Card",
  "CtaCard",
])

/**
 * Audit a content directory for missing fields, schema errors, and structural problems.
 * Pure function — no console output, no process.exit.
 */
export function auditContent(contentDir: string): AuditResult {
  if (!fs.existsSync(contentDir)) {
    throw new AuditError(`Content directory not found: ${contentDir}`)
  }

  const issues: AuditIssue[] = []
  let articleCount = 0
  let categoryCount = 0

  const categories = fs
    .readdirSync(contentDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())

  for (const dir of categories) {
    categoryCount++
    const categoryPath = path.join(contentDir, dir.name)

    // Check for _category.json
    const metaPath = path.join(categoryPath, "_category.json")
    if (!fs.existsSync(metaPath)) {
      issues.push({
        level: "warning",
        file: `${dir.name}/`,
        message: "missing _category.json",
      })
    }

    // Check articles
    const files = fs
      .readdirSync(categoryPath)
      .filter((f) => f.endsWith(".mdx") || f.endsWith(".md"))

    if (files.length === 0) {
      issues.push({
        level: "warning",
        file: `${dir.name}/`,
        message: "has no articles",
      })
    }

    // Collect referenced asset filenames for unused-file detection
    const referencedAssets = new Set<string>()

    for (const file of files) {
      articleCount++
      const filePath = path.join(categoryPath, file)
      const raw = fs.readFileSync(filePath, "utf-8")
      const fileRef = `${dir.name}/${file}`

      try {
        const { data, content } = matter(raw)

        if (!data.title) {
          issues.push({ level: "error", file: fileRef, message: "missing title" })
        }
        if (!data.description) {
          issues.push({ level: "error", file: fileRef, message: "missing description" })
        }
        if (!data.schemaVersion) {
          issues.push({ level: "error", file: fileRef, message: "missing schemaVersion" })
        }

        // heroImage file existence check
        const slug = file.replace(/\.mdx?$/, "")
        if (typeof data.heroImage === "string") {
          const assetDir = path.join(categoryPath, slug)
          const heroPath = path.join(assetDir, data.heroImage)
          if (!fs.existsSync(heroPath)) {
            issues.push({
              level: "error",
              file: fileRef,
              message: `heroImage "${data.heroImage}" not found at ${dir.name}/${slug}/${data.heroImage}`,
            })
          }
          referencedAssets.add(`${slug}/${data.heroImage}`)
        }
        if (typeof data.coverImage === "string") {
          referencedAssets.add(`${slug}/${data.coverImage}`)
        }
        if (typeof data.ogImage === "string") {
          referencedAssets.add(`${slug}/${data.ogImage}`)
        }

        // Strip code blocks (fenced and inline) before validation.
        // Code blocks may contain example JSX tags and src= attributes
        // that should not be validated as real references.
        // Code blocks may contain example src= attributes and markdown images
        // that should not be validated as real file references.
        const contentNoFences = content
          .replace(/```[\s\S]*?```/g, "")  // fenced code blocks
          .replace(/`[^`]+`/g, "")          // inline code

        // MDX component name validation (on code-stripped content)
        validateMdxComponents(contentNoFences, fileRef, issues)

        // Collect image refs from MDX body for unused-file detection
        // AND validate that explicitly referenced files (./ prefix) exist on disk.
        const srcRefs = contentNoFences.matchAll(/\bsrc=["']([^"']+)["']/g)
        for (const match of srcRefs) {
          if (match[1] && !match[1].startsWith("http") && !match[1].startsWith("/")) {
            const ref = match[1].replace(/^\.\//, "")
            referencedAssets.add(`${slug}/${ref}`)

            // Only validate file existence for explicit relative paths (./foo.png).
            // Plain references (foo.png) are collected for unused-file detection
            // but may be component prop examples, not real file references.
            if (match[1].startsWith("./")) {
              const refPath = path.join(categoryPath, slug, ref)
              if (!fs.existsSync(refPath)) {
                issues.push({
                  level: "error",
                  file: fileRef,
                  message: `referenced image "${ref}" not found at ${dir.name}/${slug}/${ref}`,
                })
              }
            }
          }
        }
        // Markdown images (also use fenced-block-stripped content)
        const mdImgRefs = contentNoFences.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)
        for (const match of mdImgRefs) {
          if (match[1] && !match[1].startsWith("http") && !match[1].startsWith("/")) {
            const ref = match[1].replace(/^\.\//, "")
            referencedAssets.add(`${slug}/${ref}`)

            // Markdown images are always explicit references — validate existence.
            const refPath = path.join(categoryPath, slug, ref)
            if (!fs.existsSync(refPath)) {
              issues.push({
                level: "error",
                file: fileRef,
                message: `referenced image "${ref}" not found at ${dir.name}/${slug}/${ref}`,
              })
            }
          }
        }
      } catch {
        issues.push({ level: "error", file: fileRef, message: "invalid frontmatter" })
      }
    }

    // Unused file warnings: check asset subdirectories
    const ASSET_EXTENSIONS = new Set([
      ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".mp4", ".webm",
    ])
    const subdirs = fs
      .readdirSync(categoryPath, { withFileTypes: true })
      .filter((d) => d.isDirectory())

    for (const subdir of subdirs) {
      const subdirPath = path.join(categoryPath, subdir.name)
      const assetFiles = fs.readdirSync(subdirPath).filter(
        (f) => ASSET_EXTENSIONS.has(path.extname(f).toLowerCase()),
      )
      for (const assetFile of assetFiles) {
        const ref = `${subdir.name}/${assetFile}`
        if (!referencedAssets.has(ref)) {
          issues.push({
            level: "warning",
            file: `${dir.name}/${ref}`,
            message: `unused asset file "${assetFile}" — not referenced by any article`,
          })
        }
      }
    }
  }

  // Internal link validation: build a set of valid routes from all content,
  // then check every internal link in every article against it.
  validateInternalLinks(contentDir, issues)

  // Guard against the silent-footgun case: a content directory that exists
  // but contains zero categories.
  if (categoryCount === 0) {
    issues.push({
      level: "warning",
      file: `${path.basename(contentDir)}/`,
      message:
        "no categories found — is this the right directory? (use --dir <path>)",
    })
  }

  return { categoryCount, articleCount, issues }
}

/**
 * Build the set of valid internal routes from the content directory, then
 * scan every article for internal links (markdown links + href props) and
 * flag any that don't resolve to a known route.
 *
 * Valid routes: /{category} and /{category}/{slug} for every category/article.
 * Links inside fenced code blocks or inline code are skipped (they're examples).
 */
function validateInternalLinks(
  contentDir: string,
  issues: AuditIssue[],
): void {
  // Build the set of valid routes
  const validRoutes = new Set<string>(["/"])

  const categories = fs
    .readdirSync(contentDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())

  for (const dir of categories) {
    validRoutes.add(`/${dir.name}`)
    const categoryPath = path.join(contentDir, dir.name)
    const files = fs
      .readdirSync(categoryPath)
      .filter((f) => f.endsWith(".mdx") || f.endsWith(".md"))

    for (const file of files) {
      const slug = file.replace(/\.mdx?$/, "")
      validRoutes.add(`/${dir.name}/${slug}`)
    }
  }

  // Scan every article for internal links
  for (const dir of categories) {
    const categoryPath = path.join(contentDir, dir.name)
    const files = fs
      .readdirSync(categoryPath)
      .filter((f) => f.endsWith(".mdx") || f.endsWith(".md"))

    for (const file of files) {
      const filePath = path.join(categoryPath, file)
      const raw = fs.readFileSync(filePath, "utf-8")
      const fileRef = `${dir.name}/${file}`

      // Strip frontmatter
      const contentOnly = raw.replace(/^---[\s\S]*?---/, "")

      // Strip code blocks (fenced and inline) to avoid flagging examples
      const stripped = contentOnly
        .replace(/```[\s\S]*?```/g, "")
        .replace(/`[^`]+`/g, "")

      // Extract internal links from:
      // 1. Markdown links: [text](/path) or [text](/path#anchor)
      // 2. href props: href="/path" or href="/path#anchor"
      const linkPatterns = [
        /\[[^\]]*\]\(\/([^)#\s]*)[^)]*\)/g,  // markdown links
        /href="\/([^"#]*)[^"]*"/g,            // JSX href props
      ]

      for (const pattern of linkPatterns) {
        for (const match of stripped.matchAll(pattern)) {
          const target = `/${match[1]}`

          // Skip placeholder/example paths
          if (target === "/path" || target === "/category/slug" || target === "/") {
            continue
          }

          if (!validRoutes.has(target)) {
            issues.push({
              level: "warning",
              file: fileRef,
              message: `broken internal link "${target}" — no matching article or category found`,
            })
          }
        }
      }
    }
  }
}

/**
 * Extract JSX component names from MDX content and flag unknown ones.
 * Uses regex to find PascalCase JSX tags (components start with uppercase).
 */
function validateMdxComponents(
  content: string,
  fileRef: string,
  issues: AuditIssue[],
): void {
  // Match opening JSX tags with PascalCase names: <Callout, <CardGroup, etc.
  const tagPattern = /<([A-Z][a-zA-Z0-9]*)/g
  const seen = new Set<string>()

  for (const match of content.matchAll(tagPattern)) {
    const name = match[1]!
    if (seen.has(name)) continue
    seen.add(name)

    if (!VALID_MDX_COMPONENTS.has(name)) {
      issues.push({
        level: "error",
        file: fileRef,
        message: `unknown MDX component <${name}> — valid components: ${[...VALID_MDX_COMPONENTS].join(", ")}`,
      })
    }
  }
}

export class AuditError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AuditError"
  }
}

/**
 * Validate a single article file. Subset of auditContent():
 *   - frontmatter required fields (title, description, schemaVersion)
 *   - MDX component names
 *   - heroImage + markdown/JSX image references point at existing files
 *
 * Intentionally does NOT do cross-file checks (broken internal links,
 * unused assets). Those need the whole tree and belong in `helpbase
 * audit`, not on-save feedback. Returns `[]` for a healthy file so
 * watchers can clear stale findings on the next valid save.
 *
 * `filePath` must be an absolute or cwd-relative path to a .mdx / .md
 * file that lives at `<contentDir>/<category>/<slug>.mdx`. Missing files
 * throw AuditError so callers can distinguish "file gone" (delete event)
 * from "file broken" (real issue).
 */
export function validateArticle(filePath: string): AuditIssue[] {
  if (!fs.existsSync(filePath)) {
    throw new AuditError(`Article not found: ${filePath}`)
  }
  const ext = path.extname(filePath)
  if (ext !== ".mdx" && ext !== ".md") {
    throw new AuditError(`Not an article file: ${filePath}`)
  }

  const issues: AuditIssue[] = []
  const categoryPath = path.dirname(filePath)
  const categoryName = path.basename(categoryPath)
  const fileName = path.basename(filePath)
  const fileRef = `${categoryName}/${fileName}`
  const slug = fileName.replace(/\.mdx?$/, "")
  const raw = fs.readFileSync(filePath, "utf-8")

  let data: Record<string, unknown>
  let content: string
  try {
    const parsed = matter(raw)
    data = parsed.data
    content = parsed.content
  } catch {
    issues.push({ level: "error", file: fileRef, message: "invalid frontmatter" })
    return issues
  }

  if (!data.title) {
    issues.push({ level: "error", file: fileRef, message: "missing title" })
  }
  if (!data.description) {
    issues.push({ level: "error", file: fileRef, message: "missing description" })
  }
  if (!data.schemaVersion) {
    issues.push({ level: "error", file: fileRef, message: "missing schemaVersion" })
  }

  if (typeof data.heroImage === "string") {
    const heroPath = path.join(categoryPath, slug, data.heroImage)
    if (!fs.existsSync(heroPath)) {
      issues.push({
        level: "error",
        file: fileRef,
        message: `heroImage "${data.heroImage}" not found at ${categoryName}/${slug}/${data.heroImage}`,
      })
    }
  }

  // Strip code blocks so example JSX tags / src= attrs don't produce noise.
  const contentNoFences = content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "")

  validateMdxComponents(contentNoFences, fileRef, issues)

  // Explicit relative refs (./file.png) — validate existence.
  const srcRefs = contentNoFences.matchAll(/\bsrc=["']([^"']+)["']/g)
  for (const match of srcRefs) {
    const ref = match[1]
    if (ref && ref.startsWith("./")) {
      const refPath = path.join(categoryPath, slug, ref.replace(/^\.\//, ""))
      if (!fs.existsSync(refPath)) {
        issues.push({
          level: "error",
          file: fileRef,
          message: `referenced image "${ref.replace(/^\.\//, "")}" not found`,
        })
      }
    }
  }
  const mdImgRefs = contentNoFences.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)
  for (const match of mdImgRefs) {
    const ref = match[1]
    if (ref && !ref.startsWith("http") && !ref.startsWith("/")) {
      const rel = ref.replace(/^\.\//, "")
      const refPath = path.join(categoryPath, slug, rel)
      if (!fs.existsSync(refPath)) {
        issues.push({
          level: "error",
          file: fileRef,
          message: `referenced image "${rel}" not found`,
        })
      }
    }
  }

  return issues
}
