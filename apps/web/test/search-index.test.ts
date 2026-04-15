import { describe, it, expect } from "vitest"
import { buildSearchIndex } from "../lib/search-index"
import type { ArticleMeta, Category } from "@workspace/shared/types"

/**
 * buildSearchIndex is a pure function — it turns articles + categories into
 * SearchItem records the client palette can consume. These tests pin down
 * the shape contract and the href format, so any change here fails loudly.
 */

function makeArticle(overrides: Partial<ArticleMeta> = {}): ArticleMeta {
  return {
    schemaVersion: 1,
    title: "Test article",
    description: "A description",
    slug: "test-article",
    category: "getting-started",
    filePath: "getting-started/test-article.mdx",
    tags: [],
    order: 999,
    featured: false,
    ...overrides,
  }
}

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    slug: "getting-started",
    title: "Getting Started",
    description: "",
    icon: "file-text",
    order: 0,
    articles: [],
    ...overrides,
  }
}

describe("buildSearchIndex", () => {
  it("returns one SearchItem per article", () => {
    const articles = [
      makeArticle({ slug: "a", title: "A" }),
      makeArticle({ slug: "b", title: "B" }),
      makeArticle({ slug: "c", title: "C" }),
    ]
    const index = buildSearchIndex(articles, [makeCategory()])
    expect(index).toHaveLength(3)
  })

  it("computes href as /{category}/{slug}", () => {
    const articles = [
      makeArticle({ slug: "install", category: "getting-started" }),
      makeArticle({ slug: "build", category: "cli" }),
    ]
    const index = buildSearchIndex(articles, [
      makeCategory({ slug: "getting-started" }),
      makeCategory({ slug: "cli", title: "CLI" }),
    ])
    expect(index[0]?.href).toBe("/getting-started/install")
    expect(index[1]?.href).toBe("/cli/build")
  })

  it("resolves categoryTitle from the category map", () => {
    const articles = [makeArticle({ category: "cli" })]
    const categories = [makeCategory({ slug: "cli", title: "CLI Reference" })]
    const index = buildSearchIndex(articles, categories)
    expect(index[0]?.categoryTitle).toBe("CLI Reference")
  })

  it("falls back to the slug when no category metadata is found", () => {
    const articles = [makeArticle({ category: "orphaned" })]
    const index = buildSearchIndex(articles, [])
    expect(index[0]?.categoryTitle).toBe("orphaned")
  })

  it("preserves article description as-is (even empty)", () => {
    const articles = [makeArticle({ description: "" })]
    const index = buildSearchIndex(articles, [makeCategory()])
    expect(index[0]?.description).toBe("")
  })

  it("handles zero articles", () => {
    expect(buildSearchIndex([], [makeCategory()])).toEqual([])
  })

  it("handles articles across multiple categories", () => {
    const articles = [
      makeArticle({ slug: "a", category: "getting-started", title: "Start" }),
      makeArticle({ slug: "b", category: "cli", title: "CLI" }),
      makeArticle({ slug: "c", category: "guides", title: "Guide" }),
    ]
    const categories = [
      makeCategory({ slug: "getting-started", title: "Getting Started" }),
      makeCategory({ slug: "cli", title: "CLI" }),
      makeCategory({ slug: "guides", title: "Guides" }),
    ]
    const index = buildSearchIndex(articles, categories)
    expect(index.map((i) => i.categoryTitle)).toEqual([
      "Getting Started",
      "CLI",
      "Guides",
    ])
  })
})
