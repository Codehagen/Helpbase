import { describe, it, expect } from "vitest"
import matter from "gray-matter"
import {
  buildContextPrompt,
  buildLocalAskPrompt,
  sanitizeMdx,
  articleToMdxWithCitations,
  estimateTokens,
} from "../ai-context.js"
import type { ContextSource } from "../context-reader.js"
import type { GeneratedContextDoc } from "../schemas.js"

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

  it("specifies the snippet contract is literal bytes, not paraphrased", () => {
    expect(prompt.toLowerCase()).toContain("verbatim")
    expect(prompt.toLowerCase()).toContain("literal")
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
    expect(parsed.data.helpbaseContextVersion).toBe("1")
    expect(parsed.data.citations).toHaveLength(1)
    const c = parsed.data.citations[0]
    expect(c.file).toBe("src/auth.ts")
    expect(c.startLine).toBe(1)
    expect(c.endLine).toBe(1)
    expect(c.snippet).toContain("export function login")
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
