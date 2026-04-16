import { describe, it, expect } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { loadDocs, type Doc } from "../src/content/loader.js"
import {
  buildSearchIndex,
  cosineSimilarity,
  loadSearchIndex,
  saveSearchIndex,
  semanticSearch,
  type Embedder,
  type SearchIndex,
} from "../src/content/semantic.js"
import { buildServer } from "../src/server.js"
import { searchDocs } from "../src/content/index.js"
import { handleSearchDocs } from "../src/tools/search-docs.js"

const FIXTURE_ROOT = path.join(__dirname, "fixtures", "content")

/**
 * Deterministic fake embedder: each document becomes a 3-dim vector pinned
 * to a theme (docs vs guide vs auth). Real embeddings aren't deterministic
 * across Node versions, so we use our own toy embedding geometry and verify
 * that the search geometry works end-to-end.
 *
 * Key ideas:
 *   - "auth"/"login"/"token"/"authenticate" → [0, 0, 1] (auth cluster)
 *   - "install"/"setup"/"get started" → [1, 0, 0] (install cluster)
 *   - "introduction"/"overview"/"welcome" → [0, 1, 0] (intro cluster)
 *
 * We blend scores by counting cluster keywords in the text, then normalize.
 */
const AUTH_TERMS = ["auth", "authenticate", "login", "token", "authorization"]
const INSTALL_TERMS = ["install", "installation", "setup", "start", "npm"]
const INTRO_TERMS = ["introduction", "overview", "welcome", "helpbase", "what"]

function countTerms(text: string, terms: string[]): number {
  const lower = text.toLowerCase()
  let n = 0
  for (const t of terms) {
    const re = new RegExp(`\\b${t}\\b`, "g")
    const matches = lower.match(re)
    if (matches) n += matches.length
  }
  return n
}

function normalize(v: number[]): number[] {
  let sum = 0
  for (const x of v) sum += x * x
  const mag = Math.sqrt(sum) || 1
  return v.map((x) => x / mag)
}

function fakeEmbedTexts(texts: string[]): number[][] {
  return texts.map((text) =>
    normalize([
      countTerms(text, INSTALL_TERMS),
      countTerms(text, INTRO_TERMS),
      countTerms(text, AUTH_TERMS),
    ]),
  )
}

const fakeEmbedder: Embedder = async (texts) => fakeEmbedTexts(texts)

describe("cosineSimilarity", () => {
  it("returns 1 for identical unit vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1)
  })

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0)
  })

  it("returns 0 when a vector is zero-length", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 0, 0])).toBe(0)
  })

  it("returns 0 when dims mismatch", () => {
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0)
  })
})

describe("buildSearchIndex + semanticSearch with a fake embedder", () => {
  const docs = loadDocs(FIXTURE_ROOT)

  it("ranks the auth-themed query nearest the auth doc", async () => {
    const index = await buildSearchIndex(docs, { embedder: fakeEmbedder })
    const hits = await semanticSearch(
      docs,
      "how do I authenticate my requests with a token",
      index,
      { embedder: fakeEmbedder },
    )
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]!.doc.slug).toBe("authentication")
  })

  it("ranks the install query nearest the installation doc", async () => {
    const index = await buildSearchIndex(docs, { embedder: fakeEmbedder })
    const hits = await semanticSearch(
      docs,
      "how do I install and get started",
      index,
      { embedder: fakeEmbedder },
    )
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]!.doc.slug).toBe("installation")
  })

  it("returns no hits when index is empty", async () => {
    const empty: SearchIndex = {
      version: 1,
      model: "test",
      dim: 3,
      entries: [],
    }
    const hits = await semanticSearch(docs, "anything", empty, {
      embedder: fakeEmbedder,
    })
    expect(hits).toEqual([])
  })

  it("skips docs present in content dir but missing from the index", async () => {
    const onlyAuthDoc = docs.find((d) => d.slug === "authentication")!
    const partial = await buildSearchIndex([onlyAuthDoc], {
      embedder: fakeEmbedder,
    })
    const hits = await semanticSearch(docs, "token login", partial, {
      embedder: fakeEmbedder,
    })
    expect(hits.map((h) => h.doc.slug)).toEqual(["authentication"])
  })
})

describe("saveSearchIndex + loadSearchIndex round-trip", () => {
  it("writes and reads a valid index", async () => {
    const docs = loadDocs(FIXTURE_ROOT)
    const index = await buildSearchIndex(docs, { embedder: fakeEmbedder })

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-idx-"))
    const filePath = path.join(tmp, "search-index.json")
    try {
      saveSearchIndex(index, filePath)
      expect(fs.existsSync(filePath)).toBe(true)
      const loaded = loadSearchIndex(filePath)
      expect(loaded).not.toBeNull()
      expect(loaded!.version).toBe(1)
      expect(loaded!.dim).toBe(3)
      expect(loaded!.entries.length).toBe(docs.length)
      expect(loaded!.entries[0]!.vector.length).toBe(3)
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it("returns null for a missing file", () => {
    expect(loadSearchIndex("/tmp/does-not-exist-xyz.json")).toBeNull()
  })

  it("returns null for a malformed file instead of throwing", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-idx-"))
    const filePath = path.join(tmp, "bad.json")
    try {
      fs.writeFileSync(filePath, "{not valid json")
      expect(loadSearchIndex(filePath)).toBeNull()
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it("returns null when version is wrong", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-idx-"))
    const filePath = path.join(tmp, "v99.json")
    try {
      fs.writeFileSync(
        filePath,
        JSON.stringify({
          version: 99,
          model: "whatever",
          dim: 3,
          entries: [],
        }),
      )
      expect(loadSearchIndex(filePath)).toBeNull()
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it("returns null when a vector length disagrees with dim", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-idx-"))
    const filePath = path.join(tmp, "mismatch.json")
    try {
      fs.writeFileSync(
        filePath,
        JSON.stringify({
          version: 1,
          model: "fake",
          dim: 3,
          entries: [{ key: "x/y", vector: [1, 2] }],
        }),
      )
      expect(loadSearchIndex(filePath)).toBeNull()
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
})

describe("searchDocs dispatcher", () => {
  const docs: Doc[] = loadDocs(FIXTURE_ROOT)

  it("uses semantic search when index is provided", async () => {
    const index = await buildSearchIndex(docs, { embedder: fakeEmbedder })
    const hits = await searchDocs(docs, "login with a token", {
      index,
      embedder: fakeEmbedder,
    })
    expect(hits[0]!.doc.slug).toBe("authentication")
  })

  it("falls back to keyword search when no index is provided", async () => {
    const hits = await searchDocs(docs, "installation")
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]!.doc.slug).toBe("installation")
  })
})

describe("handleSearchDocs with semantic index", () => {
  it("surfaces the semantic winner in the text response", async () => {
    const docs = loadDocs(FIXTURE_ROOT)
    const index = await buildSearchIndex(docs, { embedder: fakeEmbedder })
    const result = await handleSearchDocs(
      docs,
      { query: "please help me login" },
      { index, embedder: fakeEmbedder },
    )
    const text = result.content[0]?.text ?? ""
    expect(text).toContain("authentication")
  })
})

describe("buildServer semantic wiring", () => {
  it("loads a semantic index when passed a valid file path", async () => {
    const docs = loadDocs(FIXTURE_ROOT)
    const index = await buildSearchIndex(docs, { embedder: fakeEmbedder })
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-idx-"))
    const filePath = path.join(tmp, "search-index.json")
    try {
      saveSearchIndex(index, filePath)
      const { deps } = buildServer({
        contentDir: FIXTURE_ROOT,
        searchIndexPath: filePath,
      })
      expect(deps.searchIndex).not.toBeNull()
      expect(deps.searchIndex!.entries.length).toBe(docs.length)
      expect(deps.searchIndexPath).toBe(filePath)
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it("falls back to keyword mode when searchIndexPath is null", () => {
    const { deps } = buildServer({
      contentDir: FIXTURE_ROOT,
      searchIndexPath: null,
    })
    expect(deps.searchIndex).toBeNull()
  })

  it("falls back to keyword mode when the index file is absent", () => {
    const { deps } = buildServer({
      contentDir: FIXTURE_ROOT,
      searchIndexPath: "/tmp/helpbase-definitely-not-here-xyz.json",
    })
    expect(deps.searchIndex).toBeNull()
  })
})
