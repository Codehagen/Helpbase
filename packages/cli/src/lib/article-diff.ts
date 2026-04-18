import pc from "picocolors"
import type { StateArticle, StateCategory } from "./tenants-client.js"

/**
 * Client-side diff engine for `helpbase deploy --preview` and the
 * smart-prompt default flow. Compares what the user has in `content/`
 * (freshly validated by deploy's step-2.5 reader) against the deployed
 * state snapshot returned by GET /state.
 *
 * Identity model (T3A/T4A):
 *   articles:   (category, slug) is canonical; file_path is metadata.
 *               A rename keeping the same (category, slug) = UPDATE if the
 *               content_hash differs, unchanged otherwise. Category move
 *               or slug change = REMOVE + ADD. Smart rename heuristics
 *               are deferred to v2.1.
 *   categories: slug is canonical. Anything else (title/icon/order/
 *               description) change = UPDATE.
 *
 * Hashes are equal-compared directly. Empty remote hash (pre-v2 rows)
 * always reads as "different" from any local hash — the first post-v2
 * preview will correctly show those articles as UPDATED until the next
 * deploy populates real hashes.
 */

export interface LocalArticle {
  slug: string
  category: string
  title: string
  description: string
  file_path: string
  content_hash: string
  order: number
  tags: string[]
  featured: boolean
  hero_image: string | null
  video_embed: string | null
}

export interface LocalCategory {
  slug: string
  title: string
  description: string
  icon: string
  order: number
}

export interface ArticleDiff {
  added: LocalArticle[]
  updated: Array<{ local: LocalArticle; remote: StateArticle }>
  removed: StateArticle[]
  unchanged: Array<{ local: LocalArticle; remote: StateArticle }>
}

export interface CategoryDiff {
  added: LocalCategory[]
  updated: Array<{ local: LocalCategory; remote: StateCategory }>
  removed: StateCategory[]
}

export interface DeployDiff {
  articles: ArticleDiff
  categories: CategoryDiff
}

function articleKey(a: { category: string; slug: string }): string {
  return `${a.category}/${a.slug}`
}

function categoryDiffers(local: LocalCategory, remote: StateCategory): boolean {
  if (local.title !== remote.title) return true
  if (local.description !== remote.description) return true
  // icon IS nullable in StateCategory per the /state response — normalize
  // null to "" so a locally-declared "file-text" default doesn't register
  // as different from a remote null.
  if (local.icon !== (remote.icon ?? "")) return true
  if (local.order !== remote.order) return true
  return false
}

export function computeDiff(
  local: { articles: LocalArticle[]; categories: LocalCategory[] },
  remote: { articles: StateArticle[]; categories: StateCategory[] },
): DeployDiff {
  const localByKey = new Map(local.articles.map((a) => [articleKey(a), a]))
  const remoteByKey = new Map(remote.articles.map((a) => [articleKey(a), a]))

  const added: LocalArticle[] = []
  const updated: Array<{ local: LocalArticle; remote: StateArticle }> = []
  const unchanged: Array<{ local: LocalArticle; remote: StateArticle }> = []
  for (const [key, localArticle] of localByKey) {
    const remoteArticle = remoteByKey.get(key)
    if (!remoteArticle) {
      added.push(localArticle)
    } else if (remoteArticle.content_hash !== localArticle.content_hash) {
      updated.push({ local: localArticle, remote: remoteArticle })
    } else {
      unchanged.push({ local: localArticle, remote: remoteArticle })
    }
  }

  const removed: StateArticle[] = []
  for (const [key, remoteArticle] of remoteByKey) {
    if (!localByKey.has(key)) removed.push(remoteArticle)
  }

  const localCatBySlug = new Map(local.categories.map((c) => [c.slug, c]))
  const remoteCatBySlug = new Map(remote.categories.map((c) => [c.slug, c]))

  const catAdded: LocalCategory[] = []
  const catUpdated: Array<{ local: LocalCategory; remote: StateCategory }> = []
  for (const [slug, localCat] of localCatBySlug) {
    const remoteCat = remoteCatBySlug.get(slug)
    if (!remoteCat) {
      catAdded.push(localCat)
    } else if (categoryDiffers(localCat, remoteCat)) {
      catUpdated.push({ local: localCat, remote: remoteCat })
    }
  }
  const catRemoved: StateCategory[] = []
  for (const [slug, remoteCat] of remoteCatBySlug) {
    if (!localCatBySlug.has(slug)) catRemoved.push(remoteCat)
  }

  return {
    articles: { added, updated, removed, unchanged },
    categories: { added: catAdded, updated: catUpdated, removed: catRemoved },
  }
}

export function diffHasChanges(diff: DeployDiff): boolean {
  return (
    diff.articles.added.length > 0 ||
    diff.articles.updated.length > 0 ||
    diff.articles.removed.length > 0 ||
    diff.categories.added.length > 0 ||
    diff.categories.updated.length > 0 ||
    diff.categories.removed.length > 0
  )
}

/**
 * Destructive-op detection for D1A smart-prompt: removing articles or
 * categories is the scary case that warrants a confirmation prompt.
 * Adds + updates are "routine" and deploy silently on the happy path.
 */
export function diffHasRemoves(diff: DeployDiff): boolean {
  return diff.articles.removed.length > 0 || diff.categories.removed.length > 0
}

/**
 * Short one-liner for the silent-deploy happy path.
 *   "Publishing 3 updated, 1 new."
 *   "Publishing 2 new, 1 category updated."
 *   "No changes to publish."
 */
export function renderSummaryLine(diff: DeployDiff): string {
  const parts: string[] = []
  if (diff.articles.added.length > 0) parts.push(`${diff.articles.added.length} new`)
  if (diff.articles.updated.length > 0) parts.push(`${diff.articles.updated.length} updated`)
  if (diff.articles.removed.length > 0) parts.push(`${diff.articles.removed.length} removed`)
  const catChanges =
    diff.categories.added.length + diff.categories.updated.length + diff.categories.removed.length
  if (catChanges > 0) {
    parts.push(`${catChanges} categor${catChanges === 1 ? "y" : "ies"} changed`)
  }
  if (parts.length === 0) return "No changes to publish."
  return `Publishing ${parts.join(", ")}.`
}

/**
 * Full preview table for --preview mode and the removes-detected prompt
 * path. Groups by change type, colors destructive rows red, preserves
 * file_path so users can find the source file.
 *
 * Long titles are truncated to fit in a single terminal line; the full
 * title is still in the MDX file. Truncation is cosmetic.
 */
export function renderPreviewTable(diff: DeployDiff): string {
  const lines: string[] = []
  const { articles, categories } = diff

  if (articles.added.length > 0) {
    lines.push(pc.bold(pc.green(`  Added (${articles.added.length}):`)))
    for (const a of articles.added) {
      lines.push(`    ${pc.green("+")} ${pc.cyan(articleKey(a))}  ${pc.dim(truncate(a.title, 60))}`)
    }
  }
  if (articles.updated.length > 0) {
    lines.push(pc.bold(pc.yellow(`  Updated (${articles.updated.length}):`)))
    for (const { local } of articles.updated) {
      lines.push(
        `    ${pc.yellow("~")} ${pc.cyan(articleKey(local))}  ${pc.dim(truncate(local.title, 60))}`,
      )
    }
  }
  if (articles.removed.length > 0) {
    lines.push(pc.bold(pc.red(`  Removed (${articles.removed.length}):`)))
    for (const a of articles.removed) {
      lines.push(`    ${pc.red("-")} ${pc.cyan(articleKey(a))}  ${pc.dim(truncate(a.title, 60))}`)
    }
  }

  const catChanges =
    categories.added.length + categories.updated.length + categories.removed.length
  if (catChanges > 0) {
    lines.push(pc.bold(pc.dim(`  Categories:`)))
    for (const c of categories.added) {
      lines.push(`    ${pc.green("+")} ${pc.cyan(c.slug)}  ${pc.dim(truncate(c.title, 60))}`)
    }
    for (const { local } of categories.updated) {
      lines.push(`    ${pc.yellow("~")} ${pc.cyan(local.slug)}  ${pc.dim(truncate(local.title, 60))}`)
    }
    for (const c of categories.removed) {
      lines.push(`    ${pc.red("-")} ${pc.cyan(c.slug)}  ${pc.dim(truncate(c.title, 60))}`)
    }
  }

  if (lines.length === 0) return "  No changes."
  return lines.join("\n")
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s
  return s.slice(0, maxLen - 1) + "…"
}

// Re-export for tests + deploy.ts
export { articleKey }
