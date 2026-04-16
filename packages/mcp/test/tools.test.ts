import { describe, it, expect } from "vitest"
import path from "node:path"
import { loadCategories, loadDocs } from "../src/content/loader.js"
import { handleSearchDocs } from "../src/tools/search-docs.js"
import { handleGetDoc } from "../src/tools/get-doc.js"
import { handleListDocs } from "../src/tools/list-docs.js"

const FIXTURE_ROOT = path.join(__dirname, "fixtures", "content")
const docs = loadDocs(FIXTURE_ROOT)
const categories = loadCategories(FIXTURE_ROOT)

describe("search_docs tool", () => {
  it("finds docs by title keyword", async () => {
    const result = await handleSearchDocs(docs, { query: "installation" })
    const text = result.content[0]?.text ?? ""
    expect(text).toContain("installation")
  })

  it("finds docs by body keyword", async () => {
    const result = await handleSearchDocs(docs, {
      query: "authorization header",
    })
    const text = result.content[0]?.text ?? ""
    expect(text).toContain("authentication")
  })

  it("returns a human-readable 'no matches' message for empty results", async () => {
    const result = await handleSearchDocs(docs, {
      query: "xyzzy-nonexistent-term",
    })
    const text = result.content[0]?.text ?? ""
    expect(text).toMatch(/no docs matched/i)
  })

  it("respects the limit parameter", async () => {
    const result = await handleSearchDocs(docs, {
      query: "helpbase",
      limit: 1,
    })
    const text = result.content[0]?.text ?? ""
    // Only one bullet item should appear.
    const bulletCount = (text.match(/^-\s/gm) ?? []).length
    expect(bulletCount).toBeLessThanOrEqual(1)
  })
})

describe("get_doc tool", () => {
  it("returns full content for a known slug", () => {
    const result = handleGetDoc(docs, { slug: "introduction" })
    expect(result.isError).toBeFalsy()
    const text = result.content[0]?.text ?? ""
    expect(text).toContain("Introduction to Helpbase")
    expect(text).toContain("open-source help center")
  })

  it("supports category/slug format", () => {
    const result = handleGetDoc(docs, { slug: "guides/authentication" })
    expect(result.isError).toBeFalsy()
    const text = result.content[0]?.text ?? ""
    expect(text).toContain("Authorization header")
  })

  it("returns isError:true for unknown slug", () => {
    const result = handleGetDoc(docs, { slug: "definitely-not-real" })
    expect(result.isError).toBe(true)
    const text = result.content[0]?.text ?? ""
    expect(text).toContain("No doc found")
  })
})

describe("list_docs tool", () => {
  it("groups docs by category respecting _category.json order", () => {
    const result = handleListDocs(docs, categories, {})
    const text = result.content[0]?.text ?? ""
    const gettingStartedIdx = text.indexOf("Getting Started")
    const guidesIdx = text.indexOf("Guides")
    expect(gettingStartedIdx).toBeGreaterThanOrEqual(0)
    expect(guidesIdx).toBeGreaterThanOrEqual(0)
    expect(gettingStartedIdx).toBeLessThan(guidesIdx)
  })

  it("filters to a single category when passed", () => {
    const result = handleListDocs(docs, categories, { category: "guides" })
    const text = result.content[0]?.text ?? ""
    expect(text).toContain("authentication")
    expect(text).not.toContain("introduction")
  })

  it("returns a helpful message when the filter matches nothing", () => {
    const result = handleListDocs(docs, categories, {
      category: "nonexistent",
    })
    const text = result.content[0]?.text ?? ""
    expect(text).toMatch(/no docs found/i)
  })
})
