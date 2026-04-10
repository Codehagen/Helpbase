import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import matter from "gray-matter"
import {
  resolveModel,
  articleToMdx,
  planArticleWrites,
  scrapeUrl,
  buildPrompt,
  DEFAULT_MODEL,
  TEST_MODEL,
  MIN_SCRAPED_LENGTH,
  MissingApiKeyError,
  GatewayError,
  generateArticlesFromContent,
} from "@workspace/shared/ai"
import type { GeneratedArticle } from "@workspace/shared/schemas"

describe("resolveModel", () => {
  it("returns the default when nothing is passed", () => {
    expect(resolveModel()).toBe(DEFAULT_MODEL)
  })

  it("returns the test model when --test is set", () => {
    expect(resolveModel({ test: true })).toBe(TEST_MODEL)
  })

  it("modelOverride wins over --test", () => {
    expect(
      resolveModel({ test: true, modelOverride: "anthropic/claude-sonnet-4.6" }),
    ).toBe("anthropic/claude-sonnet-4.6")
  })

  it("modelOverride wins over default", () => {
    expect(resolveModel({ modelOverride: "openai/gpt-5.4" })).toBe(
      "openai/gpt-5.4",
    )
  })
})

describe("articleToMdx", () => {
  const sample: GeneratedArticle = {
    title: "How to reset your password",
    description: "Steps to recover account access via email.",
    category: "Account & Billing",
    tags: ["password", "account"],
    content: "# Reset\n\nClick the forgot password link.",
  }

  it("wraps content in valid frontmatter", () => {
    const mdx = articleToMdx(sample, 1)
    expect(mdx).toContain('schemaVersion: 1')
    expect(mdx).toContain('title: "How to reset your password"')
    expect(mdx).toContain('description: "Steps to recover account access via email."')
    expect(mdx).toContain('order: 1')
    expect(mdx).toContain('featured: false')
  })

  it("escapes titles and descriptions correctly", () => {
    const tricky: GeneratedArticle = {
      ...sample,
      title: 'Use "advanced" mode',
      description: "It's powerful.",
    }
    const mdx = articleToMdx(tricky, 2)
    // JSON.stringify handles the quotes
    expect(mdx).toContain('title: "Use \\"advanced\\" mode"')
    expect(mdx).toContain('description: "It\'s powerful."')
  })

  it("writes tags as a JSON array", () => {
    const mdx = articleToMdx(sample, 1)
    expect(mdx).toContain('tags: ["password", "account"]')
  })

  it("handles empty tags", () => {
    const mdx = articleToMdx({ ...sample, tags: [] }, 1)
    expect(mdx).toContain("tags: []")
  })

  it("includes the body content after the frontmatter", () => {
    const mdx = articleToMdx(sample, 1)
    expect(mdx).toMatch(/---\n\n# Reset/)
  })
})

describe("planArticleWrites", () => {
  const articles: GeneratedArticle[] = [
    {
      title: "Install the CLI",
      description: "Get started in one command.",
      category: "Getting Started",
      tags: ["install"],
      content: "Run `npx create-helpbase`.",
    },
    {
      title: "Write your first article",
      description: "Add MDX to the content directory.",
      category: "Getting Started",
      tags: ["content"],
      content: "Create a file in `content/`.",
    },
    {
      title: "Reset your password",
      description: "Recover account access.",
      category: "Account & Billing",
      tags: ["account"],
      content: "Click forgot password.",
    },
  ]

  it("groups articles by slugified category", () => {
    const plans = planArticleWrites(articles, "/tmp/out")
    expect(plans).toHaveLength(3)
    const slugs = plans.map((p) => p.categorySlug)
    expect(slugs.filter((s) => s === "getting-started")).toHaveLength(2)
    expect(slugs.filter((s) => s === "account-billing")).toHaveLength(1)
  })

  it("preserves the human-readable category title", () => {
    const plans = planArticleWrites(articles, "/tmp/out")
    const gettingStarted = plans.find((p) => p.categorySlug === "getting-started")
    expect(gettingStarted?.categoryTitle).toBe("Getting Started")
    const billing = plans.find((p) => p.categorySlug === "account-billing")
    expect(billing?.categoryTitle).toBe("Account & Billing")
  })

  it("assigns order values 1..N within each category", () => {
    const plans = planArticleWrites(articles, "/tmp/out")
    const gettingStartedMdx = plans
      .filter((p) => p.categorySlug === "getting-started")
      .map((p) => p.mdx)
    expect(gettingStartedMdx[0]).toContain("order: 1")
    expect(gettingStartedMdx[1]).toContain("order: 2")
  })

  it("builds file paths under the output directory", () => {
    const plans = planArticleWrites(articles, "/tmp/out")
    expect(plans[0]!.filePath).toBe("/tmp/out/getting-started/install-the-cli.mdx")
  })
})

describe("scrapeUrl empty-content guard", () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it("throws a clear error when stripped content is under MIN_SCRAPED_LENGTH", async () => {
    // Mock fetch to return a 200 with a near-empty body (just a tiny shell,
    // like a JS-only SPA root).
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () =>
        `<html><head><title>Loading...</title></head><body><div id="root"></div></body></html>`,
    } as Response)

    await expect(scrapeUrl("https://example.com")).rejects.toThrow(
      /too short/i,
    )
    await expect(scrapeUrl("https://example.com")).rejects.toThrow(
      /JS-rendered, behind auth, or empty/i,
    )
  })

  it("includes the actual char count and the minimum in the error", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => `<html><body>short</body></html>`,
    } as Response)

    await expect(scrapeUrl("https://example.com")).rejects.toThrow(
      new RegExp(`${MIN_SCRAPED_LENGTH}\\+`),
    )
  })

  it("passes when stripped content is over MIN_SCRAPED_LENGTH", async () => {
    const longText = "word ".repeat(200) // ~1000 chars
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => `<html><body>${longText}</body></html>`,
    } as Response)

    const result = await scrapeUrl("https://example.com")
    expect(result.length).toBeGreaterThanOrEqual(MIN_SCRAPED_LENGTH)
    expect(result).toContain("word")
  })
})

describe("articleToMdx YAML round-trip safety", () => {
  // These tests feed articleToMdx the kinds of titles and descriptions an
  // LLM might actually produce, then parse the output with gray-matter to
  // confirm every field survives the round-trip. Any failure here means we
  // would have shipped broken MDX to users.

  it("round-trips a title with a leading YAML list marker", () => {
    const tricky: GeneratedArticle = {
      title: "- A leading dash looks like a YAML list",
      description: "Normal description.",
      category: "Edge Cases",
      tags: ["weird"],
      content: "# Body",
    }
    const mdx = articleToMdx(tricky, 1)
    const parsed = matter(mdx)
    expect(parsed.data.title).toBe("- A leading dash looks like a YAML list")
    expect(parsed.data.description).toBe("Normal description.")
  })

  it("round-trips a description with an embedded newline", () => {
    const tricky: GeneratedArticle = {
      title: "Normal title",
      description: "Line one\nLine two",
      category: "Edge Cases",
      tags: ["weird"],
      content: "# Body",
    }
    const mdx = articleToMdx(tricky, 1)
    const parsed = matter(mdx)
    expect(parsed.data.title).toBe("Normal title")
    expect(parsed.data.description).toBe("Line one\nLine two")
  })

  it("round-trips titles with YAML flow indicators", () => {
    const indicators = ["#", "|", ">", "{", "[", "&", "*", "!", "%", "@", "`"]
    for (const ch of indicators) {
      const tricky: GeneratedArticle = {
        title: `${ch} in the title`,
        description: "Plain description.",
        category: "Edge Cases",
        tags: [],
        content: "# Body",
      }
      const mdx = articleToMdx(tricky, 1)
      const parsed = matter(mdx)
      expect(parsed.data.title).toBe(`${ch} in the title`)
    }
  })

  it("round-trips tags with special characters", () => {
    const tricky: GeneratedArticle = {
      title: "Normal",
      description: "Normal.",
      category: "Normal",
      tags: ["c++", "f#", "node.js"],
      content: "# Body",
    }
    const mdx = articleToMdx(tricky, 1)
    const parsed = matter(mdx)
    expect(parsed.data.tags).toEqual(["c++", "f#", "node.js"])
  })
})

describe("generateArticlesFromContent", () => {
  const originalKey = process.env.AI_GATEWAY_API_KEY

  beforeEach(() => {
    delete process.env.AI_GATEWAY_API_KEY
    vi.resetModules()
  })

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.AI_GATEWAY_API_KEY = originalKey
    } else {
      delete process.env.AI_GATEWAY_API_KEY
    }
    vi.restoreAllMocks()
  })

  it("throws MissingApiKeyError when AI_GATEWAY_API_KEY is not set", async () => {
    await expect(
      generateArticlesFromContent({
        content: "Some scraped content about a product.",
        sourceUrl: "https://example.com",
      }),
    ).rejects.toBeInstanceOf(MissingApiKeyError)
  })

  it("wraps gateway failures in GatewayError", async () => {
    process.env.AI_GATEWAY_API_KEY = "test-key-123"

    vi.doMock("ai", () => ({
      generateObject: vi.fn().mockRejectedValue(
        new Error("model not found: bogus/model"),
      ),
    }))

    const { generateArticlesFromContent: mockedGenerate, GatewayError: GE } =
      await import("@workspace/shared/ai")

    await expect(
      mockedGenerate({
        content: "scraped",
        sourceUrl: "https://example.com",
        model: "bogus/model",
      }),
    ).rejects.toBeInstanceOf(GE)
  })

  it("returns the articles from the generateObject result on success", async () => {
    process.env.AI_GATEWAY_API_KEY = "test-key-123"

    const fakeArticles: GeneratedArticle[] = [
      {
        title: "Fake article",
        description: "A fake description.",
        category: "Getting Started",
        tags: ["fake"],
        content: "# Fake",
      },
    ]

    vi.doMock("ai", () => ({
      generateObject: vi.fn().mockResolvedValue({
        object: { articles: fakeArticles },
      }),
    }))

    const { generateArticlesFromContent: mockedGenerate } =
      await import("@workspace/shared/ai")

    const result = await mockedGenerate({
      content: "scraped",
      sourceUrl: "https://example.com",
    })

    expect(result).toEqual(fakeArticles)
  })
})

describe("buildPrompt v0.0.4 — component palette", () => {
  const prompt = buildPrompt("sample content", "https://example.com")

  it("includes a 'Component palette' section", () => {
    expect(prompt).toContain("Component palette")
  })

  it("includes <Steps> example", () => {
    expect(prompt).toContain("<Steps>")
    expect(prompt).toContain("<Step")
  })

  it("bans Figure, Video, CtaCard, and Tabs from generated output", () => {
    expect(prompt).toContain("Do NOT use <Figure>")
    expect(prompt).toContain("<Video>")
    expect(prompt).toContain("<CtaCard>")
    expect(prompt).toContain("<Tabs>")
  })

  // v0.0.3 regression: core content rules must still be present
  it("still includes v0.0.3 rules: 3-heading rule, 150-word floor, banned words", () => {
    expect(prompt).toContain("at least 3 markdown")
    expect(prompt).toContain("minimum 150 words")
    expect(prompt).toMatch(/streamline.*seamless|seamless.*streamline/)
  })
})
