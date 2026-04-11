import { describe, it, expect } from "vitest"
import { execSync } from "node:child_process"
import path from "node:path"
import matter from "gray-matter"
import {
  extractJsonFromText,
  articleToMdx,
  GatewayError,
} from "@workspace/shared/ai"
import { buildVisualPrompt } from "@workspace/shared/ai-visual"
import type { GeneratedArticle, ArticleImage } from "@workspace/shared/schemas"

// ── extractJsonFromText ────────────────────────────────────────────

describe("extractJsonFromText", () => {
  it("parses clean JSON directly", () => {
    const result = extractJsonFromText('{"key": "value"}')
    expect(result).toEqual({ key: "value" })
  })

  it("extracts JSON from markdown code fences", () => {
    const raw = `Here is the result:

\`\`\`json
{"articles": [{"title": "Test"}]}
\`\`\`

That's the output.`
    const result = extractJsonFromText(raw) as { articles: unknown[] }
    expect(result.articles).toHaveLength(1)
  })

  it("extracts JSON from fences without language hint", () => {
    const raw = "```\n{\"key\": \"val\"}\n```"
    const result = extractJsonFromText(raw)
    expect(result).toEqual({ key: "val" })
  })

  it("extracts JSON by finding first { and last }", () => {
    const raw = 'Some commentary before {"data": true} and after.'
    const result = extractJsonFromText(raw)
    expect(result).toEqual({ data: true })
  })

  it("throws GatewayError when all extraction fails", () => {
    expect(() => extractJsonFromText("no json here at all")).toThrow(
      GatewayError,
    )
    expect(() => extractJsonFromText("no json here at all")).toThrow(
      /invalid JSON/i,
    )
  })

  it("includes raw output preview in error message", () => {
    const longText = "x".repeat(600)
    try {
      extractJsonFromText(longText)
    } catch (err) {
      expect(err).toBeInstanceOf(GatewayError)
      // Should include first 500 chars
      expect((err as Error).message).toContain("x".repeat(100))
      // Should not include the full 600
      expect((err as Error).message.length).toBeLessThan(600)
    }
  })
})

// ── articleToMdx with Figure insertion ──────────────────────────────

describe("articleToMdx with images", () => {
  const sample: GeneratedArticle = {
    title: "How to invite a teammate",
    description: "Walk through the invite flow step by step.",
    category: "Getting Started",
    tags: ["team", "invite"],
    content: `## Prerequisites

Make sure you have admin access to the team settings.

<Steps>
  <Step title="Open settings">Navigate to the Settings page from the sidebar.</Step>
  <Step title="Click Invite">Click the blue Invite button in the top right corner.</Step>
  <Step title="Enter email">Type the teammate's email and click Send.</Step>
</Steps>

## Troubleshooting

If the invite doesn't arrive, check the spam folder.`,
  }

  const images: ArticleImage[] = [
    { filename: "01-settings.png", alt: "Settings page with sidebar", step: 1 },
    { filename: "02-invite.png", alt: "Invite button highlighted", step: 2 },
    { filename: "03-email.png", alt: "Email input form", step: 3 },
  ]

  it("inserts Figure components inside Step blocks", () => {
    const mdx = articleToMdx(sample, 1, images)

    // Each Figure should appear before the closing </Step>
    expect(mdx).toContain('<Figure src="./01-settings.png"')
    expect(mdx).toContain('<Figure src="./02-invite.png"')
    expect(mdx).toContain('<Figure src="./03-email.png"')
  })

  it("preserves valid frontmatter with Figure content", () => {
    const mdx = articleToMdx(sample, 1, images)
    const parsed = matter(mdx)
    expect(parsed.data.title).toBe("How to invite a teammate")
    expect(parsed.data.schemaVersion).toBe(1)
  })

  it("includes alt text in Figure tags", () => {
    const mdx = articleToMdx(sample, 1, images)
    expect(mdx).toContain('alt="Settings page with sidebar"')
    expect(mdx).toContain('alt="Invite button highlighted"')
  })

  it("works without images (backward compatible)", () => {
    const mdx = articleToMdx(sample, 1)
    expect(mdx).not.toContain("<Figure")
    expect(mdx).toContain("## Prerequisites")
    expect(mdx).toContain("<Steps>")
  })

  it("inserts Figures after paragraphs when no Steps block", () => {
    const noSteps: GeneratedArticle = {
      title: "Overview",
      description: "A general overview.",
      category: "General",
      tags: ["overview"],
      content: `## Introduction

This is the first paragraph.

## Features

This is the second paragraph.

## Summary

This is the third paragraph.`,
    }

    const imgs: ArticleImage[] = [
      { filename: "01-intro.png", alt: "Introduction screen", step: 1 },
      { filename: "02-features.png", alt: "Features page", step: 3 },
    ]

    const mdx = articleToMdx(noSteps, 1, imgs)
    expect(mdx).toContain('<Figure src="./01-intro.png"')
    expect(mdx).toContain('<Figure src="./02-features.png"')
  })
})

// ── buildVisualPrompt ──────────────────────────────────────────────

describe("buildVisualPrompt", () => {
  it("includes screenshot count", () => {
    const prompt = buildVisualPrompt({
      screenshotCount: 5,
    })
    expect(prompt).toContain("5 screenshots")
  })

  it("includes title when provided", () => {
    const prompt = buildVisualPrompt({
      screenshotCount: 3,
      title: "How to invite a teammate",
    })
    expect(prompt).toContain("How to invite a teammate")
  })

  it("includes source URL in combined mode", () => {
    const prompt = buildVisualPrompt({
      screenshotCount: 3,
      sourceUrl: "https://myapp.com",
    })
    expect(prompt).toContain("https://myapp.com")
  })

  it("includes captions when provided", () => {
    const prompt = buildVisualPrompt({
      screenshotCount: 2,
      captions: {
        "01-settings.png": "Click the gear icon",
        "02-billing.png": "Select monthly plan",
      },
    })
    expect(prompt).toContain("Click the gear icon")
    expect(prompt).toContain("Select monthly plan")
  })

  it("includes text context in combined mode", () => {
    const prompt = buildVisualPrompt({
      screenshotCount: 3,
      textContext: "This product helps teams collaborate on documents.",
    })
    expect(prompt).toContain("ADDITIONAL PRODUCT CONTEXT")
    expect(prompt).toContain("collaborate on documents")
  })

  it("bans Figure from generated output (system inserts it)", () => {
    const prompt = buildVisualPrompt({ screenshotCount: 1 })
    expect(prompt).toContain("Do NOT use <Figure>")
  })

  it("instructs use of Steps component", () => {
    const prompt = buildVisualPrompt({ screenshotCount: 3 })
    expect(prompt).toContain("<Steps>")
    expect(prompt).toContain("<Step>")
  })

  it("enforces grounding rules", () => {
    const prompt = buildVisualPrompt({ screenshotCount: 1 })
    expect(prompt).toContain("ONLY what you can see")
    expect(prompt).toContain("streamline")
  })
})

// ── Generate command CLI tests ─────────────────────────────────────

const CLI_PATH = path.resolve(__dirname, "../dist/index.js")

function runCli(args: string): { output: string; exitCode: number } {
  try {
    const stdout = execSync(`node ${CLI_PATH} ${args}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, NO_COLOR: "1" },
    })
    return { output: stdout, exitCode: 0 }
  } catch (err: any) {
    const output = (err.stdout ?? "") + (err.stderr ?? "")
    return { output, exitCode: err.status ?? 1 }
  }
}

describe("helpbase generate --screenshots CLI", () => {

  it("shows --screenshots in error when no source provided", () => {
    const result = runCli("generate")
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("--screenshots")
  })

  it("requires --title when using --screenshots without --url", () => {
    const result = runCli("generate --screenshots /nonexistent")
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("--title")
  })
})
