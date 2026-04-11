import { generateObject, generateText } from "ai"
import {
  generatedArticlesSchema,
  type GeneratedArticle,
  type ArticleImage,
} from "./schemas.js"
import { slugify } from "./slugify.js"
import type { z } from "zod"

/**
 * Shared AI infrastructure for helpbase CLI and scaffolder.
 *
 * Architecture (after split):
 *   ai.ts        — shared: model resolution, error classes, callGenerator,
 *                   extractJsonFromText, articleToMdx, planArticleWrites
 *   ai-text.ts   — text generation: scrapeUrl, generateArticlesFromContent,
 *                   buildPrompt
 *   ai-visual.ts — visual generation: generateArticlesFromScreenshots,
 *                   buildVisualPrompt
 *
 * Uses Vercel AI SDK + AI Gateway. One env var: AI_GATEWAY_API_KEY.
 * Model is passed as a string in `provider/model` form.
 */

// ── Model constants ────────────────────────────────────────────────

/**
 * Default model for article generation.
 * Gemini 3.1 Flash Lite is fast, cheap, and has a 1M context window.
 */
export const DEFAULT_MODEL = "google/gemini-3.1-flash-lite-preview"

/**
 * Model used when --test is passed. Hard-coded so test runs stay stable.
 */
export const TEST_MODEL = "google/gemini-3.1-flash-lite-preview"

// ── Error classes ──────────────────────────────────────────────────

/** Thrown when AI_GATEWAY_API_KEY is not set in the environment. */
export class MissingApiKeyError extends Error {
  constructor() {
    super("AI_GATEWAY_API_KEY is not set")
    this.name = "MissingApiKeyError"
  }
}

/** Thrown when the Gateway returns an error (wrong model, quota, network, etc). */
export class GatewayError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = "GatewayError"
  }
}

// ── Model resolution ───────────────────────────────────────────────

export interface ResolveModelOptions {
  test?: boolean
  modelOverride?: string
}

/**
 * Resolve which model ID to use, given CLI flags.
 * Priority: explicit override > --test > default.
 */
export function resolveModel(opts: ResolveModelOptions = {}): string {
  if (opts.modelOverride) return opts.modelOverride
  if (opts.test) return TEST_MODEL
  return DEFAULT_MODEL
}

// ── Shared generator wrapper (DRY) ────────────────────────────────

export interface CallGeneratorOptions {
  model: string
  prompt: string
  schema: z.ZodType
  /** Optional inline images for multimodal generation. */
  images?: Array<{ mimeType: string; data: string }>
}

/**
 * Shared wrapper around Vercel AI SDK generation.
 * Tries generateObject first. If that fails with images (some model/SDK
 * combos don't support structured output + inline images), falls back
 * to generateText + JSON extraction.
 */
export async function callGenerator<T>({
  model,
  prompt,
  schema,
  images,
}: CallGeneratorOptions): Promise<T> {
  if (!process.env.AI_GATEWAY_API_KEY) {
    throw new MissingApiKeyError()
  }

  // Build messages array for multimodal requests
  const messages = images?.length
    ? [
        {
          role: "user" as const,
          content: [
            ...images.map((img) => ({
              type: "image" as const,
              image: `data:${img.mimeType};base64,${img.data}`,
            })),
            { type: "text" as const, text: prompt },
          ],
        },
      ]
    : undefined

  try {
    if (messages) {
      // Multimodal: try generateObject with messages
      const { object } = await generateObject({
        model,
        schema,
        messages,
      })
      return object as T
    }
    // Text-only: use prompt directly
    const { object } = await generateObject({
      model,
      schema,
      prompt,
    })
    return object as T
  } catch (err) {
    if (err instanceof MissingApiKeyError) throw err

    // If multimodal generateObject failed, try generateText fallback
    if (images?.length) {
      try {
        const { text } = await generateText({
          model,
          messages: messages!,
        })
        const parsed = extractJsonFromText(text)
        return schema.parse(parsed) as T
      } catch (fallbackErr) {
        if (fallbackErr instanceof MissingApiKeyError) throw fallbackErr
        throw new GatewayError(
          fallbackErr instanceof Error
            ? fallbackErr.message
            : "Unknown gateway error (fallback)",
          fallbackErr,
        )
      }
    }

    throw new GatewayError(
      err instanceof Error ? err.message : "Unknown gateway error",
      err,
    )
  }
}

// ── JSON extraction from generateText output ───────────────────────

/**
 * Extract JSON from raw model text output.
 * Models often wrap JSON in markdown fences or add commentary.
 *
 * Strategy:
 *   1. Try JSON.parse(raw) directly
 *   2. Extract content between ```json and ``` fences
 *   3. Find first { and last }, try JSON.parse on that substring
 *   4. Throw structured error with first 500 chars of raw output
 */
export function extractJsonFromText(raw: string): unknown {
  // 1. Direct parse
  try {
    return JSON.parse(raw)
  } catch {
    // continue to next strategy
  }

  // 2. Fence extraction
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1].trim())
    } catch {
      // continue
    }
  }

  // 3. Brace extraction
  const firstBrace = raw.indexOf("{")
  const lastBrace = raw.lastIndexOf("}")
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1))
    } catch {
      // continue
    }
  }

  // 4. Give up
  const preview = raw.slice(0, 500)
  throw new GatewayError(
    `Model returned invalid JSON. Raw output: ${preview}`,
  )
}

// ── Article serialization ──────────────────────────────────────────

/**
 * Convert a generated article into a full MDX file string with frontmatter.
 * When images are provided, inserts <Figure> components at appropriate positions.
 */
export function articleToMdx(
  article: GeneratedArticle,
  order: number,
  images?: ArticleImage[],
): string {
  const tagsYaml =
    article.tags.length > 0
      ? `[${article.tags.map((t) => JSON.stringify(t)).join(", ")}]`
      : "[]"

  let content = article.content.trim()

  // Insert Figure components when images are provided
  if (images?.length) {
    content = insertFigures(content, images)
  }

  return `---
schemaVersion: 1
title: ${JSON.stringify(article.title)}
description: ${JSON.stringify(article.description)}
tags: ${tagsYaml}
order: ${order}
featured: false
---

${content}
`
}

/**
 * Insert <Figure> components into MDX content.
 *
 * If content contains <Steps>/<Step> blocks: insert Figure as the last
 * child of the corresponding Step (1:1 mapping by step number).
 *
 * If no Steps: insert Figure N after the Nth prose paragraph.
 */
function insertFigures(content: string, images: ArticleImage[]): string {
  const hasSteps = /<Steps>/.test(content)

  if (hasSteps) {
    // Insert Figure inside each <Step> block by step number
    const sorted = [...images].sort((a, b) => a.step - b.step)
    for (const img of sorted) {
      const figureTag = `\n\n<Figure src="./${img.filename}" alt=${JSON.stringify(img.alt)} />`
      // Find the closing </Step> for the Nth step and insert before it
      let stepIndex = 0
      content = content.replace(/<\/Step>/g, (match) => {
        stepIndex++
        if (stepIndex === img.step) {
          return `${figureTag}\n${match}`
        }
        return match
      })
    }
  } else {
    // Insert after the Nth paragraph (double-newline separated blocks)
    const sorted = [...images].sort((a, b) => a.step - b.step)
    const paragraphs = content.split(/\n\n+/)
    const result: string[] = []

    for (let i = 0; i < paragraphs.length; i++) {
      result.push(paragraphs[i]!)
      // Check if any image's step matches this paragraph index (1-indexed)
      const matchingImages = sorted.filter((img) => img.step === i + 1)
      for (const img of matchingImages) {
        result.push(
          `<Figure src="./${img.filename}" alt=${JSON.stringify(img.alt)} />`,
        )
      }
    }
    content = result.join("\n\n")
  }

  return content
}

// ── Article write planning ─────────────────────────────────────────

export interface ArticleWritePlan {
  categorySlug: string
  categoryTitle: string
  articleSlug: string
  filePath: string
  mdx: string
  /** Source image files to copy into the article's asset folder. */
  imageFiles?: Array<{ sourcePath: string; filename: string }>
}

/**
 * Pure planning: turn generated articles into a list of write operations.
 * Does NOT touch the filesystem. The CLI/scaffolder decides when to write.
 */
export function planArticleWrites(
  articles: GeneratedArticle[],
  outputDir: string,
  imagesByArticle?: Map<number, { images: ArticleImage[]; sourceFiles: Array<{ sourcePath: string; filename: string }> }>,
): ArticleWritePlan[] {
  const byCategory = new Map<string, GeneratedArticle[]>()
  for (const article of articles) {
    const key = slugify(article.category)
    const list = byCategory.get(key) ?? []
    list.push(article)
    byCategory.set(key, list)
  }

  const plans: ArticleWritePlan[] = []
  let globalIndex = 0
  for (const [categorySlug, categoryArticles] of byCategory) {
    const categoryTitle = categoryArticles[0]!.category
    categoryArticles.forEach((article, index) => {
      const articleSlug = slugify(article.title)
      const articleImages = imagesByArticle?.get(globalIndex)
      plans.push({
        categorySlug,
        categoryTitle,
        articleSlug,
        filePath: `${outputDir}/${categorySlug}/${articleSlug}.mdx`,
        mdx: articleToMdx(article, index + 1, articleImages?.images),
        imageFiles: articleImages?.sourceFiles,
      })
      globalIndex++
    })
  }
  return plans
}
