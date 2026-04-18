import { describe, it, expect } from "vitest"
import { hashArticle, stableStringify } from "../src/article-hash.js"

/**
 * Snapshot + invariant tests for the article content hash.
 *
 * These fixtures are the contract: if the hashing algorithm changes,
 * every existing deployed tenant's content_hash column becomes stale,
 * every `helpbase deploy --preview` starts showing every article as
 * UPDATED, and users lose trust. So these tests are intentionally
 * brittle — they fail the moment the bytes change.
 *
 * To intentionally change the algorithm: write the migration + backfill
 * first, then update these fixtures + the migration version together.
 */

const FIXTURE = {
  title: "How to reset your password",
  description: "Step-by-step: recover access when you forget.",
  frontmatter: {
    schemaVersion: 1,
    title: "How to reset your password",
    description: "Step-by-step: recover access when you forget.",
    order: 3,
    tags: ["auth", "account"],
    featured: false,
  },
  content: "# Reset password\n\nClick **Forgot password** on the login screen.\n",
}

describe("hashArticle", () => {
  it("produces a 64-char hex SHA-256 digest", () => {
    const digest = hashArticle(FIXTURE)
    expect(digest).toMatch(/^[0-9a-f]{64}$/)
  })

  it("is deterministic across calls", () => {
    expect(hashArticle(FIXTURE)).toBe(hashArticle(FIXTURE))
  })

  it("snapshot — the canonical fixture digest", () => {
    // Locks the current serialization. If this changes, EVERY deployed
    // tenant's content_hash goes stale. See file header.
    expect(hashArticle(FIXTURE)).toMatchInlineSnapshot(
      `"ab983f484f6bae5c24461b56024de8baad2fb98997b9a04cb18fa6ff3a1eae7a"`,
    )
  })

  it("frontmatter key order does not affect the hash", () => {
    const reordered = {
      ...FIXTURE,
      frontmatter: {
        featured: false,
        tags: ["auth", "account"],
        order: 3,
        description: "Step-by-step: recover access when you forget.",
        title: "How to reset your password",
        schemaVersion: 1,
      },
    }
    expect(hashArticle(reordered)).toBe(hashArticle(FIXTURE))
  })

  it("nested frontmatter objects also stable across key order", () => {
    const withNested = {
      ...FIXTURE,
      frontmatter: {
        ...FIXTURE.frontmatter,
        meta: { author: "christer", published: "2026-04-18" },
      },
    }
    const reordered = {
      ...FIXTURE,
      frontmatter: {
        ...FIXTURE.frontmatter,
        meta: { published: "2026-04-18", author: "christer" },
      },
    }
    expect(hashArticle(withNested)).toBe(hashArticle(reordered))
  })

  it("array order IS semantic — tags order change DOES change the hash", () => {
    const flipped = {
      ...FIXTURE,
      frontmatter: { ...FIXTURE.frontmatter, tags: ["account", "auth"] },
    }
    expect(hashArticle(flipped)).not.toBe(hashArticle(FIXTURE))
  })

  it("title change changes the hash", () => {
    const modified = { ...FIXTURE, title: "How to reset your password!" }
    expect(hashArticle(modified)).not.toBe(hashArticle(FIXTURE))
  })

  it("description change changes the hash", () => {
    const modified = { ...FIXTURE, description: FIXTURE.description + "." }
    expect(hashArticle(modified)).not.toBe(hashArticle(FIXTURE))
  })

  it("content change changes the hash", () => {
    const modified = { ...FIXTURE, content: FIXTURE.content + "\n" }
    expect(hashArticle(modified)).not.toBe(hashArticle(FIXTURE))
  })

  it("does NOT normalize whitespace — trailing newline matters", () => {
    // T3A decision: MDX whitespace is meaningful (code blocks, JSX,
    // fenced content). Hash reflects exact stored bytes.
    const withTrailing = { ...FIXTURE, content: FIXTURE.content }
    const withoutTrailing = {
      ...FIXTURE,
      content: FIXTURE.content.replace(/\n$/, ""),
    }
    expect(hashArticle(withTrailing)).not.toBe(hashArticle(withoutTrailing))
  })

  it("does NOT normalize whitespace — indent change matters", () => {
    const tabbed = {
      ...FIXTURE,
      content: "```ts\n\tconst x = 1\n```\n",
    }
    const spaced = {
      ...FIXTURE,
      content: "```ts\n  const x = 1\n```\n",
    }
    expect(hashArticle(tabbed)).not.toBe(hashArticle(spaced))
  })

  it("empty frontmatter hashes consistently", () => {
    const empty = { ...FIXTURE, frontmatter: {} }
    expect(hashArticle(empty)).toBe(hashArticle(empty))
    expect(hashArticle(empty)).not.toBe(hashArticle(FIXTURE))
  })

  it("handles null values in frontmatter", () => {
    const withNull = {
      ...FIXTURE,
      frontmatter: { ...FIXTURE.frontmatter, heroImage: null },
    }
    expect(hashArticle(withNull)).not.toBe(hashArticle(FIXTURE))
    expect(hashArticle(withNull)).toBe(hashArticle(withNull))
  })

  it("handles undefined values in frontmatter (treated as null)", () => {
    const withUndef = {
      ...FIXTURE,
      frontmatter: { ...FIXTURE.frontmatter, heroImage: undefined },
    }
    // undefined serializes as null in our stableStringify, and the key
    // is still present in Object.keys so the hash differs from the
    // FIXTURE (which omits heroImage entirely).
    expect(hashArticle(withUndef)).not.toBe(hashArticle(FIXTURE))
  })
})

describe("stableStringify", () => {
  it("sorts keys at top level", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}')
  })

  it("sorts keys at nested levels", () => {
    expect(stableStringify({ outer: { b: 1, a: 2 } })).toBe(
      '{"outer":{"a":2,"b":1}}',
    )
  })

  it("preserves array order", () => {
    expect(stableStringify([3, 1, 2])).toBe("[3,1,2]")
  })

  it("handles primitives", () => {
    expect(stableStringify("hello")).toBe('"hello"')
    expect(stableStringify(42)).toBe("42")
    expect(stableStringify(true)).toBe("true")
    expect(stableStringify(null)).toBe("null")
  })

  it("serializes undefined as null", () => {
    expect(stableStringify(undefined)).toBe("null")
  })
})
