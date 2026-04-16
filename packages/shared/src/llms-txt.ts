/**
 * llms.txt generator — extracted shared library.
 *
 * Conforms to the llms.txt spec (https://llmstxt.org/). Emits two files:
 *
 *   llms.txt       H1 project name, blockquote summary, H2 section per
 *                  category, one bullet per doc with title + URL.
 *   llms-full.txt  Full MDX body of every doc under H1 headers with
 *                  Path + Description metadata.
 *
 * Extracted from apps/web/scripts/generate-llms.mjs and
 * packages/create-helpbase/template-assets/generate-llms.mjs so both
 * scripts can become thin wrappers + the `helpbase context` command
 * can emit the same format into `.helpbase/`.
 *
 * Pure: no fs writes. Caller decides where to persist.
 */

import fs from "node:fs"
import path from "node:path"
import matter from "gray-matter"

export interface LlmsTxtInput {
  /** Absolute path to the content directory (e.g. apps/web/content). */
  contentDir: string
  /** Project name used as the H1 title. */
  projectName: string
  /** One-line project summary shown as the opening blockquote. */
  projectSummary: string
  /**
   * Optional absolute site URL (e.g. "https://acme.dev"). If omitted,
   * doc links in llms.txt are rendered as relative paths; the caller
   * is free to warn the user.
   */
  siteUrl?: string
}

export interface LlmsTxtOutput {
  llmsTxt: string
  llmsFullTxt: string
  /** Number of docs that contributed to the output. */
  docCount: number
  /** Size of llmsFullTxt in bytes (useful for the 5MB sanity cap). */
  fullBytes: number
}

export const LLMS_FULL_MAX_BYTES = 5 * 1024 * 1024

interface Category {
  slug: string
  title: string
  order: number
}

interface Doc {
  category: string
  slug: string
  title: string
  description: string
  content: string
}

function titleCase(slug: string): string {
  return slug
    .split("-")
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ")
}

function deriveTitle(raw: unknown, slug: string): string {
  if (typeof raw === "string" && raw.trim().length > 0) return raw.trim()
  return titleCase(slug)
}

function readCategory(contentDir: string, slug: string): Category {
  const metaPath = path.join(contentDir, slug, "_category.json")
  let title = titleCase(slug)
  let order = 999
  if (fs.existsSync(metaPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(metaPath, "utf-8"))
      if (typeof parsed.title === "string") title = parsed.title
      if (typeof parsed.order === "number") order = parsed.order
    } catch {
      // Fall through to defaults.
    }
  }
  return { slug, title, order }
}

function readContent(contentDir: string): { categories: Category[]; docs: Doc[] } {
  if (!fs.existsSync(contentDir)) return { categories: [], docs: [] }

  const categoryDirs = fs
    .readdirSync(contentDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .filter((d) => !d.name.startsWith("_"))

  const categories = categoryDirs.map((d) => readCategory(contentDir, d.name))
  categories.sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug))

  const docs: Doc[] = []
  for (const dir of categoryDirs) {
    const categorySlug = dir.name
    const categoryPath = path.join(contentDir, categorySlug)
    const files = fs
      .readdirSync(categoryPath)
      .filter((f) => !f.startsWith("_"))
      .filter((f) => f.endsWith(".mdx") || f.endsWith(".md"))

    for (const file of files) {
      const filePath = path.join(categoryPath, file)
      let raw: string
      try {
        raw = fs.readFileSync(filePath, "utf-8")
      } catch {
        continue
      }
      let parsed: ReturnType<typeof matter>
      try {
        parsed = matter(raw)
      } catch {
        continue
      }
      const { data, content } = parsed
      const slug = file.replace(/\.mdx?$/, "")
      docs.push({
        category: categorySlug,
        slug,
        title: deriveTitle(data["title"], slug),
        description:
          typeof data["description"] === "string" ? data["description"].trim() : "",
        content: content.trim(),
      })
    }
  }

  docs.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category)
    return a.slug.localeCompare(b.slug)
  })

  return { categories, docs }
}

function buildLlmsTxt(
  categories: Category[],
  docs: Doc[],
  projectName: string,
  projectSummary: string,
  siteUrl?: string,
): string {
  const lines: string[] = [`# ${projectName}`, "", `> ${projectSummary}`, ""]
  const byCategory = new Map<string, Doc[]>()
  for (const doc of docs) {
    const existing = byCategory.get(doc.category) ?? []
    existing.push(doc)
    byCategory.set(doc.category, existing)
  }

  const categoryOrder: Category[] = categories.length
    ? categories
    : Array.from(byCategory.keys()).map((slug) => ({
        slug,
        title: titleCase(slug),
        order: 999,
      }))

  for (const cat of categoryOrder) {
    const docsInCat = byCategory.get(cat.slug) ?? []
    if (docsInCat.length === 0) continue
    lines.push(`## ${cat.title}`)
    lines.push("")
    for (const doc of docsInCat) {
      const url = siteUrl
        ? `${siteUrl.replace(/\/+$/, "")}/${doc.category}/${doc.slug}`
        : `/${doc.category}/${doc.slug}`
      const desc = doc.description ? `: ${doc.description}` : ""
      lines.push(`- [${doc.title}](${url})${desc}`)
    }
    lines.push("")
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n"
}

function buildLlmsFullTxt(
  docs: Doc[],
  projectName: string,
  projectSummary: string,
): string {
  const out: string[] = [`# ${projectName}`, "", `> ${projectSummary}`, ""]
  for (const doc of docs) {
    out.push(`# ${doc.title}`)
    out.push("")
    out.push(`Path: ${doc.category}/${doc.slug}`)
    if (doc.description) out.push(`Description: ${doc.description}`)
    out.push("")
    out.push(doc.content)
    out.push("")
    out.push("---")
    out.push("")
  }
  return out.join("\n").trimEnd() + "\n"
}

/**
 * Generate llms.txt + llms-full.txt for a content directory.
 *
 *   const { llmsTxt, llmsFullTxt, fullBytes } = generateLlmsTxt({
 *     contentDir: ".helpbase/docs",
 *     projectName: "Acme",
 *     projectSummary: "The thing we make.",
 *     siteUrl: "https://acme.dev",
 *   })
 *
 * No fs writes — callers handle persistence.
 */
export function generateLlmsTxt(input: LlmsTxtInput): LlmsTxtOutput {
  const { categories, docs } = readContent(input.contentDir)
  const llmsTxt = buildLlmsTxt(
    categories,
    docs,
    input.projectName,
    input.projectSummary,
    input.siteUrl,
  )
  const llmsFullTxt = buildLlmsFullTxt(docs, input.projectName, input.projectSummary)
  const fullBytes = Buffer.byteLength(llmsFullTxt, "utf-8")
  return { llmsTxt, llmsFullTxt, docCount: docs.length, fullBytes }
}
