import { describe, it, expect, beforeEach, afterEach } from "vitest"
import path from "node:path"
import {
  findContentDir,
  loadCategories,
  loadDocs,
} from "../src/content/loader.js"

const FIXTURE_ROOT = path.join(__dirname, "fixtures", "content")

describe("findContentDir", () => {
  const originalEnv = process.env.HELPBASE_CONTENT_DIR

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.HELPBASE_CONTENT_DIR
    else process.env.HELPBASE_CONTENT_DIR = originalEnv
  })

  it("honors HELPBASE_CONTENT_DIR when set", () => {
    process.env.HELPBASE_CONTENT_DIR = FIXTURE_ROOT
    expect(findContentDir()).toBe(FIXTURE_ROOT)
  })

  it("throws a clear error when HELPBASE_CONTENT_DIR points nowhere", () => {
    process.env.HELPBASE_CONTENT_DIR = "/nonexistent/path/helpbase-test"
    expect(() => findContentDir()).toThrow(/does not exist/)
  })

  it("throws when no content dir can be located (regression)", () => {
    delete process.env.HELPBASE_CONTENT_DIR
    // /tmp has no apps/web/content or content folder.
    expect(() => findContentDir("/tmp")).toThrow(/Could not find/)
  })
})

describe("loadDocs", () => {
  it("loads docs from a fixture tree", () => {
    const docs = loadDocs(FIXTURE_ROOT)
    expect(docs).toHaveLength(3)
    const slugs = docs.map((d) => `${d.category}/${d.slug}`).sort()
    expect(slugs).toEqual([
      "getting-started/installation",
      "getting-started/introduction",
      "guides/authentication",
    ])
  })

  it("extracts title and description from frontmatter", () => {
    const docs = loadDocs(FIXTURE_ROOT)
    const intro = docs.find((d) => d.slug === "introduction")
    expect(intro?.title).toBe("Introduction to Helpbase")
    expect(intro?.description).toContain("Overview")
  })

  it("skips files prefixed with underscore", () => {
    const docs = loadDocs(FIXTURE_ROOT)
    expect(docs.find((d) => d.slug === "_draft")).toBeUndefined()
  })

  it("returns empty array when content dir does not exist", () => {
    expect(loadDocs("/tmp/nonexistent-helpbase-content-xyz")).toEqual([])
  })

  it("skips files with malformed frontmatter instead of crashing (regression)", () => {
    const BAD_ROOT = path.join(__dirname, "fixtures", "content-with-bad")
    const origStderr = process.stderr.write.bind(process.stderr)
    const stderrCaptured: string[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(process.stderr as any).write = (chunk: any) => {
      stderrCaptured.push(String(chunk))
      return true
    }
    try {
      const docs = loadDocs(BAD_ROOT)
      const slugs = docs.map((d) => d.slug)
      expect(slugs).toContain("ok")
      expect(slugs).not.toContain("broken")
      expect(stderrCaptured.join("")).toMatch(/broken\.mdx/)
      expect(stderrCaptured.join("")).toMatch(/malformed frontmatter/)
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(process.stderr as any).write = origStderr
    }
  })
})

describe("loadCategories", () => {
  it("reads _category.json for title and order", () => {
    const categories = loadCategories(FIXTURE_ROOT)
    expect(categories).toHaveLength(2)
    expect(categories[0]?.slug).toBe("getting-started")
    expect(categories[0]?.title).toBe("Getting Started")
    expect(categories[0]?.order).toBe(1)
    expect(categories[1]?.slug).toBe("guides")
  })
})
