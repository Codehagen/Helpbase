#!/usr/bin/env node
/**
 * sync-content-assets
 *
 * Copies media files from content directories into public/_helpbase-assets/
 * so Next.js can serve them at /_helpbase-assets/<category>/<slug>/<file>.
 *
 * Strategy: nuke-and-rebuild. The target directory is deleted on each run
 * and re-populated from scratch. A sentinel file (.helpbase-managed) prevents
 * accidental deletion of a user-created directory.
 *
 * Environment:
 *   HELPBASE_SKIP_SYNC=1  — skip entirely (useful for CI lint-only jobs)
 *
 * Wired into apps/web/package.json as predev + prebuild.
 */

import fs from "node:fs"
import path from "node:path"
import matter from "gray-matter"

const CONTENT_DIR = path.join(process.cwd(), "content")
const TARGET_DIR = path.join(process.cwd(), "public", "_helpbase-assets")
const SENTINEL = ".helpbase-managed"
const ASSET_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".svg",
  ".mp4",
  ".webm",
])
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB hard reject
const WARN_FILE_SIZE = 2 * 1024 * 1024 // 2 MB warning

function main() {
  if (process.env.HELPBASE_SKIP_SYNC === "1") {
    console.log("[sync-assets] HELPBASE_SKIP_SYNC=1 — skipping asset sync")
    return
  }

  if (!fs.existsSync(CONTENT_DIR)) {
    console.log("[sync-assets] No content directory found — nothing to sync")
    return
  }

  // Nuke phase — only if sentinel exists (or directory doesn't exist yet)
  if (fs.existsSync(TARGET_DIR)) {
    const sentinelPath = path.join(TARGET_DIR, SENTINEL)
    if (!fs.existsSync(sentinelPath)) {
      console.error(
        `[sync-assets] ERROR: ${TARGET_DIR} exists but is missing the ${SENTINEL} sentinel.\n` +
          `  This directory was not created by sync-content-assets and will not be deleted.\n` +
          `  If you are sure this is safe, create the file manually: touch ${sentinelPath}`,
      )
      process.exit(1)
    }
    fs.rmSync(TARGET_DIR, { recursive: true, force: true })
  }

  // Rebuild phase
  fs.mkdirSync(TARGET_DIR, { recursive: true })
  fs.writeFileSync(path.join(TARGET_DIR, SENTINEL), "managed by sync-content-assets\n")

  /** @type {string[]} */
  const errors = []
  let copiedCount = 0

  const categories = fs
    .readdirSync(CONTENT_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())

  for (const catDir of categories) {
    const categoryPath = path.join(CONTENT_DIR, catDir.name)
    const entries = fs.readdirSync(categoryPath, { withFileTypes: true })

    // Process asset subdirectories (content/<cat>/<slug>/)
    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const slugDir = path.join(categoryPath, entry.name)
      const assets = fs.readdirSync(slugDir)

      for (const file of assets) {
        const ext = path.extname(file).toLowerCase()
        if (!ASSET_EXTENSIONS.has(ext)) continue

        const srcPath = path.join(slugDir, file)
        const stat = fs.statSync(srcPath)

        if (stat.size > MAX_FILE_SIZE) {
          errors.push(
            `${catDir.name}/${entry.name}/${file}: ${(stat.size / 1024 / 1024).toFixed(1)}MB exceeds 10MB limit`,
          )
          continue
        }

        if (stat.size > WARN_FILE_SIZE) {
          console.warn(
            `[sync-assets] WARNING: ${catDir.name}/${entry.name}/${file} is ${(stat.size / 1024 / 1024).toFixed(1)}MB (consider optimizing)`,
          )
        }

        const destDir = path.join(TARGET_DIR, catDir.name, entry.name)
        fs.mkdirSync(destDir, { recursive: true })
        fs.copyFileSync(srcPath, path.join(destDir, file))
        copiedCount++
      }
    }
  }

  // Validate frontmatter heroImage/coverImage/ogImage refs
  for (const catDir of categories) {
    const categoryPath = path.join(CONTENT_DIR, catDir.name)
    const files = fs
      .readdirSync(categoryPath)
      .filter((f) => f.endsWith(".mdx") || f.endsWith(".md"))

    for (const file of files) {
      const raw = fs.readFileSync(path.join(categoryPath, file), "utf-8")
      let data
      try {
        data = matter(raw).data
      } catch {
        continue
      }

      const slug = file.replace(/\.mdx?$/, "")
      const imageFields = ["heroImage", "coverImage", "ogImage"]

      for (const field of imageFields) {
        const value = data[field]
        if (typeof value !== "string") continue

        const assetPath = path.join(TARGET_DIR, catDir.name, slug, value)
        if (!fs.existsSync(assetPath)) {
          errors.push(
            `${catDir.name}/${file}: frontmatter ${field} references "${value}" but the file was not found.\n` +
              `  Expected at: content/${catDir.name}/${slug}/${value}`,
          )
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error(`[sync-assets] ${errors.length} error(s):`)
    for (const err of errors) {
      console.error(`  ✖ ${err}`)
    }
    process.exit(1)
  }

  console.log(`[sync-assets] Synced ${copiedCount} asset(s) to public/_helpbase-assets/`)
}

main()
