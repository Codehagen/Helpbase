import { describe, it, expect } from "vitest"
import { chunkArticleContent } from "../src/commands/deploy.js"

describe("chunkArticleContent", () => {
  it("returns no chunks for empty content", () => {
    expect(chunkArticleContent("")).toEqual([])
    expect(chunkArticleContent("   \n  \n  ")).toEqual([])
  })

  it("produces a single chunk for content smaller than the threshold", () => {
    const content = "## Intro\n\nOne short paragraph.\n\nAnd another."
    const chunks = chunkArticleContent(content)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]!.index).toBe(0)
    expect(chunks[0]!.content).toContain("Intro")
    expect(chunks[0]!.content).toContain("another")
    expect(chunks[0]!.lineStart).toBe(1)
    expect(chunks[0]!.lineEnd).toBeGreaterThanOrEqual(3)
    expect(chunks[0]!.tokenCount).toBeGreaterThan(0)
  })

  it("splits content that exceeds the per-chunk threshold", () => {
    // Build ~3500 chars of content across many paragraphs.
    const paragraph = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(4)
    const content = Array.from({ length: 20 }, () => paragraph).join("\n\n")
    const chunks = chunkArticleContent(content)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(1800) // header of 1600 + one overshoot paragraph
    }
    // Chunks must be contiguous and ordered.
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i]!.index).toBe(i)
    }
  })

  it("preserves semantic paragraph boundaries (no mid-paragraph cuts)", () => {
    const content = [
      "Paragraph one. Some content.",
      "Paragraph two. More content.",
      "Paragraph three. Even more content.",
    ].join("\n\n")
    const chunks = chunkArticleContent(content)
    for (const chunk of chunks) {
      // A chunk never ends mid-sentence (every paragraph ends with a period).
      expect(chunk.content.trimEnd().endsWith(".")).toBe(true)
    }
  })

  it("assigns line ranges that cover the whole article", () => {
    const content = Array.from({ length: 10 }, (_, i) => `Paragraph ${i + 1}.`).join("\n\n")
    const chunks = chunkArticleContent(content)
    // The first chunk starts at line 1.
    expect(chunks[0]!.lineStart).toBe(1)
    // Line ranges are non-decreasing across chunks.
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i]!.lineStart).toBeGreaterThanOrEqual(chunks[i - 1]!.lineEnd)
    }
  })

  it("handles content with no paragraph breaks (tiny doc edge case)", () => {
    const content = "Just a single line with no double newlines anywhere"
    const chunks = chunkArticleContent(content)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]!.content).toBe(content)
  })

  it("computes a monotone token count approximation", () => {
    const small = chunkArticleContent("short paragraph")
    const large = chunkArticleContent("a long paragraph ".repeat(200))
    expect(small[0]!.tokenCount).toBeLessThan(large[0]!.tokenCount)
  })
})
