import {
  generatedArticlesSchema,
  type GeneratedArticle,
  type ArticleImage,
} from "./schemas.js"
import { slugify } from "./slugify.js"
import type { z } from "zod"
import { callLlmObject, isByokMode } from "./llm.js"
import { AuthRequiredError, GatewayError as LlmGatewayError } from "./llm-errors.js"
import type { WireQuotaStatus, WireUsage } from "./llm-wire.js"

/**
 * Shared AI infrastructure for helpbase CLI and scaffolder.
 *
 * Architecture:
 *   ai.ts        — shared: model resolution, error classes, callGenerator,
 *                   extractJsonFromText, articleToMdx, planArticleWrites
 *   ai-text.ts   — text generation: scrapeUrl, generateArticlesFromContent,
 *                   buildPrompt
 *   ai-visual.ts — visual generation: generateArticlesFromScreenshots,
 *                   buildVisualPrompt
 *   llm.ts       — hosted-proxy + BYOK router. `callGenerator` delegates here.
 *
 * BYOK (AI_GATEWAY_API_KEY set): direct Vercel AI SDK calls, user's own bill.
 * Hosted (logged-in via helpbase): POST /api/v1/llm/generate-object with a
 * bearer token, quota-gated server-side.
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
  /**
   * Hosted-proxy session token. Ignored in BYOK mode. When null/undefined
   * and BYOK is not enabled, the call throws AuthRequiredError — the CLI
   * command layer catches that and prompts login.
   */
  authToken?: string
  /** Per-call output-token cap. Server may clamp lower for hosted calls. */
  maxOutputTokens?: number
}

/** Metadata the hosted proxy returns alongside the generated object. */
export interface CallGeneratorMeta {
  usage?: WireUsage
  quota?: WireQuotaStatus
}

/** Return shape that includes quota info when the hosted path is used. */
export interface CallGeneratorResult<T> {
  object: T
  meta: CallGeneratorMeta
}

/**
 * Shared wrapper around LLM generation.
 *
 * - BYOK (AI_GATEWAY_API_KEY set): direct Vercel AI SDK call, no usage returned.
 * - Hosted: POST to /api/v1/llm/generate-object, usage + quota returned.
 *
 * The legacy `callGenerator` that returns `T` is kept for call sites that
 * don't care about usage. New call sites should use `callGeneratorWithMeta`.
 */
export async function callGenerator<T>(opts: CallGeneratorOptions): Promise<T> {
  const { object } = await callGeneratorWithMeta<T>(opts)
  return object
}

export async function callGeneratorWithMeta<T>(
  opts: CallGeneratorOptions,
): Promise<CallGeneratorResult<T>> {
  // Preserve legacy error semantics: when NOT authed for the hosted path
  // and BYOK is off, older tests expect MissingApiKeyError. We surface
  // AuthRequiredError from llm.ts; keep a bridge so existing catch blocks
  // that check for MissingApiKeyError keep behaving.
  if (!isByokMode() && !opts.authToken) {
    throw new MissingApiKeyError()
  }

  try {
    const result = await callLlmObject<T>({
      model: opts.model,
      prompt: opts.prompt,
      schema: opts.schema as z.ZodType<T>,
      images: opts.images,
      authToken: opts.authToken,
      maxOutputTokens: opts.maxOutputTokens,
    })
    return { object: result.object, meta: { usage: result.usage, quota: result.quota } }
  } catch (err) {
    if (err instanceof AuthRequiredError) {
      // Preserve legacy MissingApiKeyError for existing callers.
      throw new MissingApiKeyError()
    }
    if (err instanceof LlmGatewayError) {
      throw new GatewayError(err.message, err.rawPreview)
    }
    throw err
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
