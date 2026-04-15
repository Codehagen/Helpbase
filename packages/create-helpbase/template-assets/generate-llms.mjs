#!/usr/bin/env node
/**
 * Generate `public/llms.txt` and `public/llms-full.txt` from the MDX content.
 *
 * - `llms.txt`      : H1 project name, blockquote summary, H2 section per
 *                     category, one bullet per doc with title + URL.
 * - `llms-full.txt` : full MDX body of every doc, concatenated under H1 headers.
 *
 * Both files conform to the `llms.txt` spec (https://llmstxt.org/).
 * Runs automatically as part of `prebuild` and `predev`.
 *
 * Configuration via environment variables (or package.json fields):
 *   HELPBASE_SITE_URL     — absolute base URL (falls back to package.json
 *                           `homepage`, or relative paths if unset)
 *   HELPBASE_PROJECT_NAME — H1 title (falls back to package.json `name`)
 *   HELPBASE_SUMMARY      — blockquote summary (falls back to package.json
 *                           `description`, or a generic fallback)
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import matter from "gray-matter"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, "..")
const CONTENT_DIR = path.join(PROJECT_ROOT, "content")
const PUBLIC_DIR = path.join(PROJECT_ROOT, "public")
const PKG_PATH = path.join(PROJECT_ROOT, "package.json")

const MAX_FULL_BYTES = 5 * 1024 * 1024

function readPackageJson() {
  try {
    return JSON.parse(fs.readFileSync(PKG_PATH, "utf-8"))
  } catch {
    return {}
  }
}

function resolveConfig() {
  const pkg = readPackageJson()
  const name = process.env.HELPBASE_PROJECT_NAME || pkg.name || "Help Center"
  const summary =
    process.env.HELPBASE_SUMMARY ||
    pkg.description ||
    "Help center and documentation site."
  const siteUrl = (process.env.HELPBASE_SITE_URL || pkg.homepage || "").replace(
    /\/$/,
    "",
  )
  return { name, summary, siteUrl }
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
      // defaults
    }
  }
  return { slug, title, order }
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
      let raw
      try {
        raw = fs.readFileSync(filePath, "utf-8")
      } catch (err) {
        console.warn(
          `[llms] Skipping ${categorySlug}/${file}: read failed (${err.message})`,
        )
        continue
      }
      let parsed
      try {
        parsed = matter(raw)
      } catch (err) {
        console.warn(
          `[llms] Skipping ${categorySlug}/${file}: malformed frontmatter (${err.message})`,
        )
        continue
      }
      const { data, content } = parsed
      const slug = file.replace(/\.mdx?$/, "")
      docs.push({
        category: categorySlug,
        slug,
        title: deriveTitle(data.title, slug),
        description:
          typeof data.description === "string" ? data.description.trim() : "",
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

function buildDocUrl(siteUrl, doc) {
  if (siteUrl.length === 0) return `/${doc.category}/${doc.slug}`
  return `${siteUrl}/${doc.category}/${doc.slug}`
}

function buildLlmsTxt(config, categories, docs) {
  const lines = [`# ${config.name}`, "", `> ${config.summary}`, ""]
  const byCategory = new Map()
  for (const doc of docs) {
    const existing = byCategory.get(doc.category) ?? []
    existing.push(doc)
    byCategory.set(doc.category, existing)
  }

  const categoryOrder = categories.length
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
      const url = buildDocUrl(config.siteUrl, doc)
      const desc = doc.description ? `: ${doc.description}` : ""
      lines.push(`- [${doc.title}](${url})${desc}`)
    }
    lines.push("")
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n"
}

function buildLlmsFullTxt(config, docs) {
  const out = [`# ${config.name}`, "", `> ${config.summary}`, ""]
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
  const config = resolveConfig()
  const { categories, docs } = readContent()

  if (docs.length === 0) {
    console.warn("[llms] No content found in ./content — writing empty files.")
  }

  if (config.siteUrl.length === 0) {
    console.warn(
      "[llms] No site URL configured. Emitting relative URLs. Set HELPBASE_SITE_URL or add `homepage` to package.json for absolute links.",
    )
  }

  const llmsTxt = buildLlmsTxt(config, categories, docs)
  const llmsFullTxt = buildLlmsFullTxt(config, docs)

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
