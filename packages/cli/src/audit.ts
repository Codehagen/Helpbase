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

    for (const file of files) {
      articleCount++
      const filePath = path.join(categoryPath, file)
      const raw = fs.readFileSync(filePath, "utf-8")
      const fileRef = `${dir.name}/${file}`

      try {
        const { data } = matter(raw)

        if (!data.title) {
          issues.push({ level: "error", file: fileRef, message: "missing title" })
        }
        if (!data.description) {
          issues.push({ level: "error", file: fileRef, message: "missing description" })
        }
        if (!data.schemaVersion) {
          issues.push({ level: "error", file: fileRef, message: "missing schemaVersion" })
        }
      } catch {
        issues.push({ level: "error", file: fileRef, message: "invalid frontmatter" })
      }
    }
  }

  // Guard against the silent-footgun case: a content directory that exists
  // but contains zero categories. Without this warning, `helpbase audit`
  // against the wrong directory (or before scaffolding) prints
  // "All content is healthy!" and exits 0 — which used to mask misconfigured
  // CI pipelines.
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

export class AuditError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AuditError"
  }
}
