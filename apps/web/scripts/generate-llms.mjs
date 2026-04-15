#!/usr/bin/env node
/**
 * Generate `public/llms.txt` and `public/llms-full.txt` from the MDX content.
 *
 * - `llms.txt`      : H1 project name, blockquote summary, H2 section per
 *                     category, one bullet per doc with title + absolute URL.
 * - `llms-full.txt` : full MDX body of every doc, concatenated under H1 headers.
 *
 * Both files conform to the `llms.txt` spec (https://llmstxt.org/).
 * They are build artifacts written into `public/` and served alongside the
 * docs site so AI agents can pull the whole knowledge surface in one request.
 *
 * Runs as part of `prebuild` alongside `sync-content-assets.mjs`.
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import matter from "gray-matter"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const WEB_ROOT = path.resolve(__dirname, "..")
const CONTENT_DIR = path.join(WEB_ROOT, "content")
const PUBLIC_DIR = path.join(WEB_ROOT, "public")

const SITE_URL = process.env.HELPBASE_SITE_URL || "https://helpbase.dev"
const PROJECT_NAME = "Helpbase"
const PROJECT_SUMMARY =
  "Open-source help center you own as code. Scaffold with `npx create-helpbase`, extend with `shadcn add`, and expose your docs to AI agents via the self-hosted MCP server."

const MAX_FULL_BYTES = 5 * 1024 * 1024 // 5MB sanity cap

function readCategory(slug) {
  const metaPath = path.join(CONTENT_DIR, slug, "_category.json")
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

function titleCase(slug) {
  return slug
    .split("-")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ")
}

function deriveTitle(raw, slug) {
  if (typeof raw === "string" && raw.trim().length > 0) return raw.trim()
  return titleCase(slug)
}

function readContent() {
  if (!fs.existsSync(CONTENT_DIR)) return { categories: [], docs: [] }

  const categoryDirs = fs
    .readdirSync(CONTENT_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .filter((d) => !d.name.startsWith("_"))

  const categories = categoryDirs.map((d) => readCategory(d.name))
  categories.sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug))

  const docs = []
  for (const dir of categoryDirs) {
    const categorySlug = dir.name
    const categoryPath = path.join(CONTENT_DIR, categorySlug)
    const files = fs
      .readdirSync(categoryPath)
      .filter((f) => !f.startsWith("_"))
      .filter((f) => f.endsWith(".mdx") || f.endsWith(".md"))

    for (const file of files) {
      const filePath = path.join(categoryPath, file)
      const raw = fs.readFileSync(filePath, "utf-8")
      const { data, content } = matter(raw)
      const slug = file.replace(/\.mdx?$/, "")
      docs.push({
        category: categorySlug,
        slug,
        title: deriveTitle(data.title, slug),
        description: typeof data.description === "string" ? data.description.trim() : "",
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

function buildLlmsTxt(categories, docs) {
  const lines = [`# ${PROJECT_NAME}`, "", `> ${PROJECT_SUMMARY}`, ""]
  const byCategory = new Map()
  for (const doc of docs) {
    const existing = byCategory.get(doc.category) ?? []
    existing.push(doc)
    byCategory.set(doc.category, existing)
  }

  const categoryOrder = categories.length
    ? categories
    : Array.from(byCategory.keys()).map((slug) => ({ slug, title: titleCase(slug), order: 999 }))

  for (const cat of categoryOrder) {
    const docsInCat = byCategory.get(cat.slug) ?? []
    if (docsInCat.length === 0) continue
    lines.push(`## ${cat.title}`)
    lines.push("")
    for (const doc of docsInCat) {
      const url = `${SITE_URL}/${doc.category}/${doc.slug}`
      const desc = doc.description ? `: ${doc.description}` : ""
      lines.push(`- [${doc.title}](${url})${desc}`)
    }
    lines.push("")
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n"
}

function buildLlmsFullTxt(docs) {
  const out = [`# ${PROJECT_NAME}`, "", `> ${PROJECT_SUMMARY}`, ""]
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

function main() {
  const { categories, docs } = readContent()

  if (docs.length === 0) {
    console.warn("[llms] No content found; writing empty files.")
  }

  const llmsTxt = buildLlmsTxt(categories, docs)
  const llmsFullTxt = buildLlmsFullTxt(docs)

  const fullBytes = Buffer.byteLength(llmsFullTxt, "utf-8")
  if (fullBytes > MAX_FULL_BYTES) {
    console.warn(
      `[llms] llms-full.txt is ${(fullBytes / 1024 / 1024).toFixed(1)}MB (over ${MAX_FULL_BYTES / 1024 / 1024}MB sanity cap). Consider trimming content.`,
    )
  }

  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true })
  }

  fs.writeFileSync(path.join(PUBLIC_DIR, "llms.txt"), llmsTxt, "utf-8")
  fs.writeFileSync(path.join(PUBLIC_DIR, "llms-full.txt"), llmsFullTxt, "utf-8")

  console.log(
    `[llms] Wrote public/llms.txt (${Buffer.byteLength(llmsTxt)} bytes) and public/llms-full.txt (${fullBytes} bytes) from ${docs.length} docs.`,
  )
}

main()
