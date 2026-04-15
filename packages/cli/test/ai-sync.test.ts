import { describe, expect, it } from "vitest"
import {
  applyProposal,
  buildSyncPrompt,
  renderProposalDiff,
} from "@workspace/shared/ai-sync"
import type { SyncProposal } from "@workspace/shared/schemas"

function proposal(overrides: Partial<SyncProposal> = {}): SyncProposal {
  return {
    file: "docs/a.mdx",
    before: "old text",
    after: "new text",
    citations: [{ sourceFile: "src/a.ts", lineStart: 1, lineEnd: 5 }],
    ...overrides,
  }
}

describe("applyProposal", () => {
  it("replaces `before` with `after` when `before` appears exactly once", () => {
    const result = applyProposal("prefix old text suffix", proposal())
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.content).toBe("prefix new text suffix")
  })

  it("reports before-not-found when `before` is absent", () => {
    const result = applyProposal("totally different content", proposal())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("before-not-found")
  })

  it("reports before-ambiguous when `before` appears more than once", () => {
    const result = applyProposal("old text and old text again", proposal())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("before-ambiguous")
  })

  it("handles multi-line before/after", () => {
    const p = proposal({ before: "line 1\nline 2", after: "LINE 1\nLINE 2\nLINE 3" })
    const result = applyProposal("prefix\nline 1\nline 2\nsuffix", p)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.content).toBe("prefix\nLINE 1\nLINE 2\nLINE 3\nsuffix")
  })
})

describe("renderProposalDiff", () => {
  it("emits a minimal unified-style diff when the proposal applies", () => {
    const out = renderProposalDiff("alpha old text omega", proposal())
    expect(out).toContain("--- a/docs/a.mdx")
    expect(out).toContain("+++ b/docs/a.mdx")
    expect(out).toContain("-old text")
    expect(out).toContain("+new text")
  })

  it("emits a skipped marker when `before` is not found", () => {
    const out = renderProposalDiff("nothing matches", proposal())
    expect(out).toContain("skipped")
    expect(out).toContain("before-not-found")
  })

  it("emits a skipped marker when `before` is ambiguous", () => {
    const out = renderProposalDiff("old text old text", proposal())
    expect(out).toContain("skipped")
    expect(out).toContain("before-ambiguous")
  })
})

describe("buildSyncPrompt", () => {
  it("includes the diff verbatim and every MDX file path", () => {
    const prompt = buildSyncPrompt({
      codeDiff: "@@ -1 +1 @@\n-old\n+new",
      mdxFiles: [
        { path: "docs/a.mdx", content: "alpha" },
        { path: "docs/b.mdx", content: "beta" },
      ],
    })
    expect(prompt).toContain("@@ -1 +1 @@")
    expect(prompt).toContain("docs/a.mdx")
    expect(prompt).toContain("docs/b.mdx")
    expect(prompt).toContain("alpha")
    expect(prompt).toContain("beta")
  })

  it("truncates huge diffs with a marker", () => {
    const huge = "x".repeat(200_000)
    const prompt = buildSyncPrompt({ codeDiff: huge, mdxFiles: [] })
    expect(prompt).toContain("[diff truncated")
  })

  it("marks truncated MDX files past the cap", () => {
    const bigContent = "z".repeat(3000)
    const files = Array.from({ length: 30 }, (_, i) => ({
      path: `docs/f${i}.mdx`,
      content: bigContent,
    }))
    const prompt = buildSyncPrompt({ codeDiff: "diff", mdxFiles: files, maxFullFiles: 5 })
    expect(prompt).toContain("(truncated)")
  })

  it("instructs the model to return an empty array when no docs need updating", () => {
    const prompt = buildSyncPrompt({ codeDiff: "diff", mdxFiles: [] })
    expect(prompt).toMatch(/empty\s+proposals array/)
  })

  it("requires at least one citation per proposal in the rules", () => {
    const prompt = buildSyncPrompt({ codeDiff: "diff", mdxFiles: [] })
    expect(prompt).toContain("citation")
    expect(prompt).toContain("sourceFile")
  })
})
