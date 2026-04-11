import {
  generatedArticlesSchema,
  type GeneratedArticle,
  type ArticleImage,
} from "./schemas.js"
import {
  DEFAULT_MODEL,
  callGenerator,
} from "./ai.js"
import type { ScreenshotFile, CaptionsMap } from "./screenshots.js"

/**
 * Visual article generation from user-provided screenshots.
 *
 * This module handles the --screenshots generation flow:
 *   read screenshots → resize → multimodal prompt → articles with Figures
 */

// ── Types ──────────────────────────────────────────────────────────

export interface VisualGenerateOptions {
  /** Screenshot files (already read, validated, and sorted). */
  screenshots: ScreenshotFile[]
  /** Optional per-image captions from captions.json. */
  captions?: CaptionsMap
  /** Optional scraped text context from --url (combined mode). */
  textContext?: string
  /** Source URL for grounding (combined mode). */
  sourceUrl?: string
  /** Title for the how-to guide (required without --url). */
  title?: string
  /** Model ID in provider/model form. */
  model?: string
}

export interface VisualGenerateResult {
  articles: GeneratedArticle[]
  /** Image metadata for each article (maps article index to its images). */
  imagesByArticle: Map<
    number,
    {
      images: ArticleImage[]
      sourceFiles: Array<{ sourcePath: string; filename: string }>
    }
  >
}

// ── Visual generation ──────────────────────────────────────────────

/**
 * Generate structured help articles from screenshots.
 * Uses multimodal Gemini input: images + text prompt → MDX with Figures.
 */
export async function generateArticlesFromScreenshots({
  screenshots,
  captions,
  textContext,
  sourceUrl,
  title,
  model = DEFAULT_MODEL,
}: VisualGenerateOptions): Promise<VisualGenerateResult> {
  const prompt = buildVisualPrompt({
    screenshotCount: screenshots.length,
    captions,
    textContext,
    sourceUrl,
    title,
  })

  // Prepare images as base64 for multimodal input
  const images = screenshots.map((s) => ({
    mimeType: s.mimeType,
    data: s.buffer.toString("base64"),
  }))

  const result = await callGenerator<{ articles: GeneratedArticle[] }>({
    model,
    prompt,
    schema: generatedArticlesSchema,
    images,
  })

  // The prompt asks for exactly 1 article. If the model returns multiple,
  // use only the first. Extra articles would lack Figure references.
  if (result.articles.length > 1) {
    result.articles = [result.articles[0]!]
  }

  // Map images to the first article (single how-to guide from screenshots).
  // Each screenshot becomes a Figure in the article.
  const imagesByArticle = new Map<
    number,
    {
      images: ArticleImage[]
      sourceFiles: Array<{ sourcePath: string; filename: string }>
    }
  >()

  if (result.articles.length > 0) {
    const articleImages: ArticleImage[] = screenshots.map((s, i) => ({
      filename: s.filename,
      alt: captions?.[s.filename] ?? `Step ${i + 1}`,
      step: i + 1,
    }))

    const sourceFiles = screenshots.map((s) => ({
      sourcePath: s.sourcePath,
      filename: s.filename,
    }))

    imagesByArticle.set(0, { images: articleImages, sourceFiles })
  }

  return { articles: result.articles, imagesByArticle }
}

// ── Visual prompt ──────────────────────────────────────────────────

interface BuildVisualPromptOptions {
  screenshotCount: number
  captions?: CaptionsMap
  textContext?: string
  sourceUrl?: string
  title?: string
}

/**
 * Build the prompt for visual article generation.
 *
 * When you change this function, run `pnpm smoke:visual --baseline`
 * to compare output against the committed prompt.
 */
export function buildVisualPrompt({
  screenshotCount,
  captions,
  textContext,
  sourceUrl,
  title,
}: BuildVisualPromptOptions): string {
  const parts: string[] = []

  parts.push(
    `You are generating a visual how-to guide from ${screenshotCount} screenshots of a product.`,
  )

  if (title) {
    parts.push(`The guide should be titled: "${title}".`)
  }

  if (sourceUrl) {
    parts.push(`The product is at ${sourceUrl}.`)
  }

  parts.push(`
Each screenshot represents a step in a user workflow. The screenshots are provided in order (image 1 is step 1, image 2 is step 2, etc.).

Generate exactly 1 help article that walks the user through the workflow shown in the screenshots.

Requirements:
- Title: MUST start with "How to" followed by a verb, OR with an imperative verb.${title ? ` Prefer: "${title}".` : ""}
- Description: one plain sentence describing the workflow.
- Category: a natural human-readable category name.
- Tags: 2-4 lowercase tags.
- Content: MDX body. Do NOT include frontmatter.

Content rules:
- Use <Steps> with one <Step> per screenshot. Each step describes what the user sees and what action to take.
- Each step body MUST describe: (1) what the user sees on screen, (2) what to click/type/do.
- The body MUST contain at least 3 markdown \`## H2\` headings. Use them to organize the guide (e.g. "## Prerequisites", then the Steps block, then "## Troubleshooting").
- Minimum 150 words of prose.
- Use <Callout type="tip"> for best practices, <Callout type="warning"> for gotchas. At most 2 callouts.
- Do NOT use <Figure>, <Video>, <CtaCard>, or <Tabs>. The system inserts <Figure> components automatically based on the screenshots you describe.

Grounding rules:
- Describe ONLY what you can see in the screenshots. Do NOT invent UI elements or features.
- Use the exact text visible in the screenshots (button labels, menu items, form fields).
- If a screenshot is unclear, describe what you can see and note the uncertainty.
- Never use marketing words: streamline, seamless, effortless, powerful, beautiful, robust, comprehensive, ultimate, cutting-edge.`)

  if (captions && Object.keys(captions).length > 0) {
    parts.push(`\nThe user provided these captions for context:`)
    for (const [file, caption] of Object.entries(captions)) {
      parts.push(`  ${file}: ${caption}`)
    }
  }

  if (textContext) {
    parts.push(`
ADDITIONAL PRODUCT CONTEXT (from website):
${textContext.slice(0, 50_000)}`)
  }

  return parts.join("\n")
}
