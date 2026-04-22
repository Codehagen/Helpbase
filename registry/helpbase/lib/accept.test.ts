import { describe, it, expect } from "vitest"
import { parseAccept, negotiate } from "./accept"

const PRODUCES = ["text/html", "text/markdown"] as const

describe("parseAccept", () => {
  it("returns empty for null/empty headers", () => {
    expect(parseAccept(null)).toEqual([])
    expect(parseAccept(undefined)).toEqual([])
    expect(parseAccept("")).toEqual([])
  })

  it("parses a single media range with default q=1", () => {
    const [entry] = parseAccept("text/markdown")
    expect(entry).toMatchObject({ type: "text", subtype: "markdown", q: 1, specificity: 3 })
  })

  it("parses q values", () => {
    const [a, b] = parseAccept("text/html;q=0.5, text/markdown;q=0.9")
    expect(a!.q).toBe(0.5)
    expect(b!.q).toBe(0.9)
  })

  it("clamps q to 0..1 and handles bad q gracefully", () => {
    const [a] = parseAccept("text/html;q=2")
    expect(a!.q).toBe(1)
    const [b] = parseAccept("text/html;q=-1")
    expect(b!.q).toBe(0)
    const [c] = parseAccept("text/html;q=notanumber")
    expect(c!.q).toBe(1) // bad q ignored, default stays 1
  })

  it("classifies specificity", () => {
    expect(parseAccept("*/*")[0]!.specificity).toBe(1)
    expect(parseAccept("text/*")[0]!.specificity).toBe(2)
    expect(parseAccept("text/html")[0]!.specificity).toBe(3)
  })
})

describe("negotiate", () => {
  it("returns the server default when Accept is missing", () => {
    expect(negotiate(null, PRODUCES)).toBe("text/html")
    expect(negotiate("", PRODUCES)).toBe("text/html")
    expect(negotiate(undefined, PRODUCES)).toBe("text/html")
  })

  it("picks text/markdown when the client asks for it", () => {
    expect(negotiate("text/markdown", PRODUCES)).toBe("text/markdown")
  })

  it("picks text/html for a normal browser request", () => {
    // Real Firefox Accept string
    const chrome =
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
    expect(negotiate(chrome, PRODUCES)).toBe("text/html")
  })

  it("rejects text/html when q=0 even if *\\/* has higher q", () => {
    // The RFC 9110 gotcha: specific ranges override wildcards. Without
    // specificity-first matching, */*;q=1 would win and we'd serve HTML
    // to a client that explicitly said "no HTML please."
    expect(negotiate("text/html;q=0, */*;q=1", PRODUCES)).toBe("text/markdown")
  })

  it("returns null (→ 406) when no producible type is acceptable", () => {
    expect(negotiate("application/pdf", PRODUCES)).toBeNull()
    expect(negotiate("text/html;q=0, text/markdown;q=0", PRODUCES)).toBeNull()
  })

  it("prefers higher q among acceptable candidates", () => {
    expect(negotiate("text/html;q=0.5, text/markdown;q=0.9", PRODUCES)).toBe("text/markdown")
    expect(negotiate("text/html;q=0.9, text/markdown;q=0.5", PRODUCES)).toBe("text/html")
  })

  it("breaks ties by client-specified order", () => {
    expect(negotiate("text/markdown, text/html", PRODUCES)).toBe("text/markdown")
    expect(negotiate("text/html, text/markdown", PRODUCES)).toBe("text/html")
  })

  it("handles text/* wildcards", () => {
    // text/* matches both html and markdown; default ordering picks html.
    expect(negotiate("text/*", PRODUCES)).toBe("text/html")
  })

  it("specificity beats q for the match decision, not the selection", () => {
    // text/markdown;q=0.8 is specific; text/*;q=1.0 matches both but
    // text/html gets picked by order+specificity under the text/* entry.
    const accept = "text/*;q=1.0, text/markdown;q=0.8"
    expect(negotiate(accept, PRODUCES)).toBe("text/html")
  })

  it("ignores unknown parameters without crashing", () => {
    expect(negotiate("text/markdown;profile=foo;q=0.9", PRODUCES)).toBe("text/markdown")
  })

  it("is case-insensitive", () => {
    expect(negotiate("TEXT/MARKDOWN", PRODUCES)).toBe("text/markdown")
  })

  it("returns null for an empty produces list", () => {
    expect(negotiate("text/html", [])).toBeNull()
  })
})
