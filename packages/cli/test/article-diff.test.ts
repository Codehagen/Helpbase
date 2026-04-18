import { describe, it, expect } from "vitest"
import {
  computeDiff,
  diffHasChanges,
  diffHasRemoves,
  renderSummaryLine,
  renderPreviewTable,
  type LocalArticle,
  type LocalCategory,
} from "../src/lib/article-diff.js"
import type { StateArticle, StateCategory } from "../src/lib/tenants-client.js"

/**
 * Unit tests for the deploy --preview diff engine.
 *
 * Identity model under test:
 *   - articles: (category, slug) is the canonical identity
 *   - file_path / title / description are metadata (diff UPDATE, not REMOVE+ADD)
 *   - category move OR slug rename = REMOVE + ADD (by design, v2.1 adds heuristics)
 *   - content_hash equality determines UPDATED vs unchanged
 */

function localArticle(partial: Partial<LocalArticle> & { slug: string; category: string }): LocalArticle {
  return {
    title: "T",
    description: "D",
    file_path: `content/${partial.category}/${partial.slug}.mdx`,
    content_hash: "h",
    order: 0,
    tags: [],
    featured: false,
    hero_image: null,
    video_embed: null,
    ...partial,
  }
}

function stateArticle(partial: Partial<StateArticle> & { slug: string; category: string }): StateArticle {
  return {
    title: "T",
    description: "D",
    file_path: `content/${partial.category}/${partial.slug}.mdx`,
    content_hash: "h",
    updated_at: "2026-04-18T00:00:00Z",
    order: 0,
    tags: null,
    featured: false,
    hero_image: null,
    video_embed: null,
    ...partial,
  }
}

function localCategory(slug: string, overrides: Partial<LocalCategory> = {}): LocalCategory {
  return {
    slug,
    title: slug,
    description: "",
    icon: "file-text",
    order: 0,
    ...overrides,
  }
}

function stateCategory(slug: string, overrides: Partial<StateCategory> = {}): StateCategory {
  return {
    slug,
    title: slug,
    description: "",
    icon: "file-text",
    order: 0,
    ...overrides,
  }
}

describe("computeDiff — articles", () => {
  it("empty local + empty remote = no changes", () => {
    const diff = computeDiff(
      { articles: [], categories: [] },
      { articles: [], categories: [] },
    )
    expect(diff.articles.added).toHaveLength(0)
    expect(diff.articles.updated).toHaveLength(0)
    expect(diff.articles.removed).toHaveLength(0)
    expect(diffHasChanges(diff)).toBe(false)
    expect(diffHasRemoves(diff)).toBe(false)
  })

  it("fresh reservation (empty remote) = all local are added", () => {
    const diff = computeDiff(
      {
        articles: [
          localArticle({ slug: "one", category: "cat" }),
          localArticle({ slug: "two", category: "cat" }),
        ],
        categories: [localCategory("cat")],
      },
      { articles: [], categories: [] },
    )
    expect(diff.articles.added).toHaveLength(2)
    expect(diff.articles.updated).toHaveLength(0)
    expect(diff.articles.removed).toHaveLength(0)
    expect(diff.categories.added).toHaveLength(1)
    expect(diffHasChanges(diff)).toBe(true)
    expect(diffHasRemoves(diff)).toBe(false)
  })

  it("same hash = unchanged (no ADD, no UPDATE)", () => {
    const local = localArticle({ slug: "s", category: "c", content_hash: "abc" })
    const remote = stateArticle({ slug: "s", category: "c", content_hash: "abc" })
    const diff = computeDiff(
      { articles: [local], categories: [] },
      { articles: [remote], categories: [] },
    )
    expect(diff.articles.unchanged).toHaveLength(1)
    expect(diff.articles.added).toHaveLength(0)
    expect(diff.articles.updated).toHaveLength(0)
    expect(diff.articles.removed).toHaveLength(0)
    expect(diffHasChanges(diff)).toBe(false)
  })

  it("different hash = UPDATED (same category/slug)", () => {
    const local = localArticle({ slug: "s", category: "c", content_hash: "NEW" })
    const remote = stateArticle({ slug: "s", category: "c", content_hash: "OLD" })
    const diff = computeDiff(
      { articles: [local], categories: [] },
      { articles: [remote], categories: [] },
    )
    expect(diff.articles.updated).toHaveLength(1)
    expect(diff.articles.updated[0]!.local).toBe(local)
    expect(diff.articles.updated[0]!.remote).toBe(remote)
    expect(diffHasRemoves(diff)).toBe(false)
  })

  it("category-move = REMOVE + ADD (per v2 design)", () => {
    const local = localArticle({ slug: "s", category: "NEW", content_hash: "same" })
    const remote = stateArticle({ slug: "s", category: "OLD", content_hash: "same" })
    const diff = computeDiff(
      { articles: [local], categories: [] },
      { articles: [remote], categories: [] },
    )
    expect(diff.articles.added).toHaveLength(1)
    expect(diff.articles.removed).toHaveLength(1)
    expect(diff.articles.updated).toHaveLength(0)
    expect(diffHasRemoves(diff)).toBe(true)
  })

  it("slug rename with same category = REMOVE + ADD", () => {
    const local = localArticle({ slug: "NEW", category: "c" })
    const remote = stateArticle({ slug: "OLD", category: "c" })
    const diff = computeDiff(
      { articles: [local], categories: [] },
      { articles: [remote], categories: [] },
    )
    expect(diff.articles.added).toHaveLength(1)
    expect(diff.articles.removed).toHaveLength(1)
  })

  it("empty remote content_hash (pre-v2 row) shows as UPDATED", () => {
    // The migration defaults content_hash to '' for existing rows. Any
    // non-empty local hash differs, so the first post-v2 preview reads
    // those articles as UPDATED until the next deploy populates real
    // hashes. Semantically correct: we don't know if content matches.
    const local = localArticle({ slug: "s", category: "c", content_hash: "real-hash" })
    const remote = stateArticle({ slug: "s", category: "c", content_hash: "" })
    const diff = computeDiff(
      { articles: [local], categories: [] },
      { articles: [remote], categories: [] },
    )
    expect(diff.articles.updated).toHaveLength(1)
  })

  it("file_path change alone with same hash = unchanged (identity is category/slug)", () => {
    const local = localArticle({
      slug: "s",
      category: "c",
      file_path: "content/c/new-name.mdx",
      content_hash: "same",
    })
    const remote = stateArticle({
      slug: "s",
      category: "c",
      file_path: "content/c/old-name.mdx",
      content_hash: "same",
    })
    const diff = computeDiff(
      { articles: [local], categories: [] },
      { articles: [remote], categories: [] },
    )
    expect(diff.articles.unchanged).toHaveLength(1)
    expect(diff.articles.updated).toHaveLength(0)
  })

  it("mixed combinatorics — add + update + remove + unchanged", () => {
    const local = [
      localArticle({ slug: "a", category: "c", content_hash: "h" }), // unchanged
      localArticle({ slug: "b", category: "c", content_hash: "NEW" }), // updated
      localArticle({ slug: "c", category: "c" }), // added
    ]
    const remote = [
      stateArticle({ slug: "a", category: "c", content_hash: "h" }),
      stateArticle({ slug: "b", category: "c", content_hash: "OLD" }),
      stateArticle({ slug: "d", category: "c" }), // removed
    ]
    const diff = computeDiff(
      { articles: local, categories: [] },
      { articles: remote, categories: [] },
    )
    expect(diff.articles.added).toHaveLength(1)
    expect(diff.articles.updated).toHaveLength(1)
    expect(diff.articles.removed).toHaveLength(1)
    expect(diff.articles.unchanged).toHaveLength(1)
    expect(diffHasChanges(diff)).toBe(true)
    expect(diffHasRemoves(diff)).toBe(true)
  })
})

describe("computeDiff — categories", () => {
  it("category added = ADD", () => {
    const diff = computeDiff(
      { articles: [], categories: [localCategory("new")] },
      { articles: [], categories: [] },
    )
    expect(diff.categories.added).toHaveLength(1)
    expect(diff.categories.updated).toHaveLength(0)
    expect(diff.categories.removed).toHaveLength(0)
    expect(diffHasChanges(diff)).toBe(true)
  })

  it("category title change = UPDATE", () => {
    const diff = computeDiff(
      { articles: [], categories: [localCategory("c", { title: "New Title" })] },
      { articles: [], categories: [stateCategory("c", { title: "Old Title" })] },
    )
    expect(diff.categories.updated).toHaveLength(1)
  })

  it("category icon change = UPDATE", () => {
    const diff = computeDiff(
      { articles: [], categories: [localCategory("c", { icon: "star" })] },
      { articles: [], categories: [stateCategory("c", { icon: "file-text" })] },
    )
    expect(diff.categories.updated).toHaveLength(1)
  })

  it("category order change = UPDATE", () => {
    const diff = computeDiff(
      { articles: [], categories: [localCategory("c", { order: 5 })] },
      { articles: [], categories: [stateCategory("c", { order: 0 })] },
    )
    expect(diff.categories.updated).toHaveLength(1)
  })

  it("category removed = REMOVE (destructive)", () => {
    const diff = computeDiff(
      { articles: [], categories: [] },
      { articles: [], categories: [stateCategory("gone")] },
    )
    expect(diff.categories.removed).toHaveLength(1)
    expect(diffHasRemoves(diff)).toBe(true)
  })

  it("identical categories produce no diff", () => {
    const diff = computeDiff(
      { articles: [], categories: [localCategory("c", { title: "T", description: "D", icon: "x", order: 3 })] },
      { articles: [], categories: [stateCategory("c", { title: "T", description: "D", icon: "x", order: 3 })] },
    )
    expect(diff.categories.added).toHaveLength(0)
    expect(diff.categories.updated).toHaveLength(0)
    expect(diff.categories.removed).toHaveLength(0)
  })
})

describe("renderSummaryLine", () => {
  it("empty diff = no-changes string", () => {
    const diff = computeDiff(
      { articles: [], categories: [] },
      { articles: [], categories: [] },
    )
    expect(renderSummaryLine(diff)).toBe("No changes to publish.")
  })

  it("single add", () => {
    const diff = computeDiff(
      { articles: [localArticle({ slug: "a", category: "c" })], categories: [] },
      { articles: [], categories: [] },
    )
    expect(renderSummaryLine(diff)).toBe("Publishing 1 new.")
  })

  it("multiple changes joined by commas", () => {
    const diff = computeDiff(
      {
        articles: [
          localArticle({ slug: "a", category: "c" }), // added
          localArticle({ slug: "b", category: "c", content_hash: "NEW" }), // updated
        ],
        categories: [],
      },
      {
        articles: [
          stateArticle({ slug: "b", category: "c", content_hash: "OLD" }),
          stateArticle({ slug: "c", category: "c" }), // removed
        ],
        categories: [],
      },
    )
    expect(renderSummaryLine(diff)).toBe("Publishing 1 new, 1 updated, 1 removed.")
  })

  it("pluralizes categories correctly", () => {
    const single = computeDiff(
      { articles: [], categories: [localCategory("c")] },
      { articles: [], categories: [] },
    )
    expect(renderSummaryLine(single)).toBe("Publishing 1 category changed.")

    const multi = computeDiff(
      { articles: [], categories: [localCategory("a"), localCategory("b")] },
      { articles: [], categories: [] },
    )
    expect(renderSummaryLine(multi)).toBe("Publishing 2 categories changed.")
  })
})

describe("renderPreviewTable", () => {
  it("empty diff returns 'No changes' string", () => {
    const diff = computeDiff(
      { articles: [], categories: [] },
      { articles: [], categories: [] },
    )
    const out = renderPreviewTable(diff)
    expect(out).toContain("No changes")
  })

  it("includes added article keys", () => {
    const diff = computeDiff(
      {
        articles: [localArticle({ slug: "my-doc", category: "getting-started", title: "Hello World" })],
        categories: [],
      },
      { articles: [], categories: [] },
    )
    const out = renderPreviewTable(diff)
    expect(out).toMatch(/getting-started\/my-doc/)
    expect(out).toMatch(/Hello World/)
  })

  it("truncates very long titles", () => {
    const longTitle = "x".repeat(200)
    const diff = computeDiff(
      { articles: [localArticle({ slug: "s", category: "c", title: longTitle })], categories: [] },
      { articles: [], categories: [] },
    )
    const out = renderPreviewTable(diff)
    // Full 200-char title should not be present verbatim (truncation kicks in)
    expect(out).not.toContain(longTitle)
    expect(out).toContain("…")
  })

  it("renders removed items in a separate section", () => {
    const diff = computeDiff(
      { articles: [], categories: [] },
      { articles: [stateArticle({ slug: "bye", category: "c", title: "Old Doc" })], categories: [] },
    )
    const out = renderPreviewTable(diff)
    expect(out).toContain("Removed")
    expect(out).toContain("c/bye")
  })
})
