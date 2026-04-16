import { describe, it, expect } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import matter from "gray-matter"
import {
  buildContextPrompt,
  buildLocalAskPrompt,
  sanitizeMdx,
  articleToMdxWithCitations,
  enrichCitationsFromDisk,
  estimateTokens,
} from "../ai-context.js"
import { createFileCache } from "../citations.js"
import type { ContextSource } from "../context-reader.js"
import type { ContextCitation, GeneratedContextDoc } from "../schemas.js"

const sampleSources: ContextSource[] = [
  {
    path: "README.md",
    content: "# Sample\n\nA fake project for the prompt test.",
    lineCount: 3,
    ext: ".md",
  },
  {
    path: "src/auth.ts",
    content: "export function login(email: string) { return { ok: true } }",
    lineCount: 1,
    ext: ".ts",
  },
]

describe("buildContextPrompt", () => {
  const prompt = buildContextPrompt({ sources: sampleSources, repoLabel: "acme/widget" })

  it("wraps repo content in <untrusted-repo-content> delimiters", () => {
    expect(prompt).toContain("<untrusted-repo-content")
    expect(prompt).toContain("</untrusted-repo-content>")
    expect(prompt).toMatch(/repo="acme\/widget"/)
  })

  it("explicitly instructs the model to treat content as data, not instructions", () => {
    expect(prompt.toLowerCase()).toMatch(/treat that content as data|ignore every instruction/i)
  })

  it("emits per-file headers with line ranges so citations can be grounded", () => {
    expect(prompt).toContain("===== README.md (lines 1-3) =====")
    expect(prompt).toContain("===== src/auth.ts (lines 1-1) =====")
  })

  it("steers the model toward task-oriented titles", () => {
    expect(prompt).toMatch(/how to log in|how to use x|how to create/i)
  })

  it("instructs the model NOT to emit snippet text (v2 contract — CLI reads disk)", () => {
    expect(prompt).toMatch(/do NOT include the snippet text yourself/i)
    expect(prompt).toMatch(/read the literal bytes.*from disk/i)
  })

  it("spells out the citation shape as {file, startLine, endLine, reason}", () => {
    expect(prompt).toContain("{file, startLine, endLine, reason}")
  })
})

describe("buildLocalAskPrompt", () => {
  it("wraps docs and refuses to guess when the answer is not present", () => {
    const p = buildLocalAskPrompt({
      question: "How do I log in?",
      docs: [
        {
          title: "How to log in",
          path: "auth/how-to-log-in.mdx",
          body: "Call POST /api/auth/login with email and password.",
        },
      ],
    })
    expect(p).toContain("<docs>")
    expect(p).toContain("</docs>")
    expect(p).toContain("How do I log in?")
    expect(p).toContain("auth/how-to-log-in.mdx")
    expect(p).toMatch(/don't guess|do NOT guess|say so/i)
  })
})

describe("sanitizeMdx", () => {
  it("removes <script> blocks", () => {
    const input = "# Title\n\n<script>alert(1)</script>\n\nbody"
    const out = sanitizeMdx(input)
    expect(out).not.toContain("<script")
    expect(out).not.toContain("alert(1)")
    expect(out).toContain("# Title")
    expect(out).toContain("body")
  })

  it("removes self-closing <script/>", () => {
    expect(sanitizeMdx("<script src='bad.js' />")).not.toContain("<script")
  })

  it("removes <iframe> tags", () => {
    expect(sanitizeMdx("<iframe src='evil.com'></iframe>x")).toContain("x")
    expect(sanitizeMdx("<iframe src='evil.com'></iframe>x")).not.toContain("<iframe")
  })

  it("removes inline event handlers on any tag", () => {
    const dirty = `<img src="a.png" onerror="steal()" alt="x">`
    const clean = sanitizeMdx(dirty)
    expect(clean).not.toContain("onerror")
    expect(clean).not.toContain("steal()")
    expect(clean).toContain("<img")
    expect(clean).toContain("alt=\"x\"")
  })

  it("removes tracking-pixel style remote 1x1 images", () => {
    const dirty = `<img src="https://tracker.example/pixel.gif" width="1" height="1">`
    expect(sanitizeMdx(dirty)).not.toContain("tracker.example")
  })

  it("leaves clean markdown unchanged", () => {
    const input = "# Title\n\nSome **bold** text and a [link](https://example.com).\n"
    expect(sanitizeMdx(input)).toBe(input)
  })
})

describe("articleToMdxWithCitations", () => {
  const doc: GeneratedContextDoc = {
    title: "How to log in",
    description: "Authenticate a user with email + password.",
    category: "Authentication",
    tags: ["auth", "login"],
    content:
      "## Overview\n\nThe login endpoint accepts email and password.\n\n## Steps\n\n1. Send POST /api/auth/login.\n\n## Troubleshooting\n\nCheck logs.",
    citations: [
      {
        file: "src/auth.ts",
        startLine: 1,
        endLine: 1,
        snippet: "export function login(email: string) { return { ok: true } }",
      },
    ],
    sourcePaths: ["src/auth.ts"],
  }

  const mdx = articleToMdxWithCitations(doc, 1)

  it("produces parseable frontmatter with source, helpbaseContextVersion, and citations", () => {
    const parsed = matter(mdx)
    expect(parsed.data.schemaVersion).toBe(1)
    expect(parsed.data.title).toBe("How to log in")
    expect(parsed.data.source).toBe("generated")
    expect(parsed.data.helpbaseContextVersion).toBe("2")
    expect(parsed.data.citations).toHaveLength(1)
    const c = parsed.data.citations[0]
    expect(c.file).toBe("src/auth.ts")
    expect(c.startLine).toBe(1)
    expect(c.endLine).toBe(1)
    expect(c.snippet).toContain("export function login")
  })

  it("honors helpbaseContextVersion override (writes v1 shape for tooling)", () => {
    const v1 = articleToMdxWithCitations(doc, 1, { helpbaseContextVersion: "1" })
    expect(matter(v1).data.helpbaseContextVersion).toBe("1")
  })

  it("appends a ## Sources section so MCP get_doc surfaces citations", () => {
    const parsed = matter(mdx)
    expect(parsed.content).toContain("## Sources")
    expect(parsed.content).toContain("`src/auth.ts` (lines 1-1)")
    expect(parsed.content).toContain("```ts")
    expect(parsed.content).toContain("export function login")
  })

  it("preserves the article body unchanged above the Sources section", () => {
    const parsed = matter(mdx)
    // Body starts with the article's first H2 and includes all three.
    expect(parsed.content).toContain("## Overview")
    expect(parsed.content).toContain("## Steps")
    expect(parsed.content).toContain("## Troubleshooting")
    // And the Sources section comes AFTER the article body.
    const overviewIdx = parsed.content.indexOf("## Overview")
    const sourcesIdx = parsed.content.indexOf("## Sources")
    expect(sourcesIdx).toBeGreaterThan(overviewIdx)
  })

  it("sanitizes dangerous MDX before writing", () => {
    const dirty: GeneratedContextDoc = {
      ...doc,
      content: "## Overview\n\n<script>alert(1)</script>\n\nbody",
    }
    const out = articleToMdxWithCitations(dirty, 1)
    expect(out).not.toContain("<script")
    expect(out).not.toContain("alert(1)")
  })

  it("accepts source override for custom user-edited files", () => {
    const parsed = matter(articleToMdxWithCitations(doc, 1, { source: "custom" }))
    expect(parsed.data.source).toBe("custom")
  })

  it("uses a longer fence when the snippet itself contains triple-backticks (regression)", () => {
    const snippetWithFence =
      "Run the command:\n\n```bash\nhelpbase context .\n```\n\nDone."
    const withBackticks: GeneratedContextDoc = {
      ...doc,
      citations: [
        {
          file: "README.md",
          startLine: 10,
          endLine: 14,
          snippet: snippetWithFence,
        },
      ],
    }
    const out = articleToMdxWithCitations(withBackticks, 1)
    // The Sources fence must be longer than any run inside the snippet.
    expect(out).toContain("````")
    // Round-trip: the inner ``` survives because the outer fence is longer.
    const parsed = matter(out)
    expect(parsed.content).toContain("```bash")
    expect(parsed.content).toContain("helpbase context .")
  })

  it("renders Sources without a code fence when the snippet is missing", () => {
    const noSnippet: GeneratedContextDoc = {
      ...doc,
      citations: [
        { file: "src/auth.ts", startLine: 1, endLine: 1, reason: "defines login" },
      ],
    }
    const out = articleToMdxWithCitations(noSnippet, 1)
    expect(out).toContain("`src/auth.ts` (lines 1-1) — defines login")
    // No code fence for this citation since there are no bytes to show.
    const sourcesBlock = out.slice(out.indexOf("## Sources"))
    expect(sourcesBlock).not.toContain("```")
  })
})

describe("enrichCitationsFromDisk", () => {
  it("fills snippet from disk bytes at the cited line range", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-enrich-"))
    fs.writeFileSync(
      path.join(tmp, "hello.ts"),
      "// line 1\nexport const x = 1\nexport const y = 2\n",
    )
    const cache = createFileCache()
    const citations: ContextCitation[] = [
      { file: "hello.ts", startLine: 2, endLine: 2, reason: "defines x" },
    ]
    const out = enrichCitationsFromDisk(citations, tmp, cache)
    expect(out).toHaveLength(1)
    expect(out[0].snippet).toBe("export const x = 1")
    expect(out[0].reason).toBe("defines x")
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it("leaves an existing snippet alone (v1 committed docs stay byte-identical)", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-enrich-"))
    fs.writeFileSync(path.join(tmp, "a.ts"), "line one\nline two\n")
    const cache = createFileCache()
    const citations: ContextCitation[] = [
      { file: "a.ts", startLine: 1, endLine: 1, snippet: "literal preserved" },
    ]
    const out = enrichCitationsFromDisk(citations, tmp, cache)
    expect(out[0].snippet).toBe("literal preserved")
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it("leaves citation intact when the cited file is unreadable (no crash)", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-enrich-"))
    const cache = createFileCache()
    const citations: ContextCitation[] = [
      { file: "missing.ts", startLine: 1, endLine: 1, reason: "ghost" },
    ]
    const out = enrichCitationsFromDisk(citations, tmp, cache)
    expect(out[0].snippet).toBeUndefined()
    expect(out[0].reason).toBe("ghost")
    fs.rmSync(tmp, { recursive: true, force: true })
  })
})

describe("estimateTokens", () => {
  it("returns Math.ceil(chars/ratio)", () => {
    const sources = [
      { path: "a.md", content: "x".repeat(7000), lineCount: 1, ext: ".md" },
    ]
    expect(estimateTokens(sources, 3.5)).toBe(2000)
  })

  it("returns 0 for empty source set", () => {
    expect(estimateTokens([], 3.5)).toBe(0)
  })

  it("returns 0 when ratio is non-positive (guards against /0)", () => {
    expect(estimateTokens(sampleSources, 0)).toBe(0)
    expect(estimateTokens(sampleSources, -1)).toBe(0)
  })
})
