import { generateObject } from "ai"
import {
  generatedArticlesSchema,
  type GeneratedArticle,
} from "./schemas.js"
import { slugify } from "./slugify.js"

/**
 * AI generation helpers for helpbase CLI and create-helpbase scaffolder.
 *
 * Design:
 * - Uses Vercel AI SDK + AI Gateway. One env var: AI_GATEWAY_API_KEY.
 * - Model is passed as a string in `provider/model` form. No provider SDK
 *   imports — the Gateway routes by prefix.
 * - Typed errors so callers can format their own problem+cause+fix+docs UX.
 */

/**
 * Default model for article generation.
 * Gemini 3.1 Flash Lite is fast, cheap, and has a 1M context window, which
 * lets us ingest full scraped pages without trimming.
 */
export const DEFAULT_MODEL = "google/gemini-3.1-flash-lite-preview"

/**
 * Model used when --test is passed. Hard-coded so test runs stay stable
 * even if DEFAULT_MODEL changes. Currently identical to DEFAULT_MODEL.
 */
export const TEST_MODEL = "google/gemini-3.1-flash-lite-preview"

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

export interface ResolveModelOptions {
  /** --test flag: forces TEST_MODEL. */
  test?: boolean
  /** --model <id> flag: wins over --test and default. */
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

/**
 * Minimum stripped-text length for a page to be considered usable.
 * Below this we assume the page is an auth wall, JS-only SPA, or empty
 * shell, and refuse to spend tokens on garbage input.
 */
export const MIN_SCRAPED_LENGTH = 500

/**
 * Fetch a URL and return a cleaned text representation.
 * Strips scripts, styles, and tags; collapses whitespace.
 * Caps at 200k chars (Gemini's 1M context is plenty; cap prevents runaway).
 * Throws if the stripped body is under MIN_SCRAPED_LENGTH chars — we'd
 * rather fail loudly than hand the LLM near-empty content and let it
 * hallucinate a help center from nothing.
 */
export async function scrapeUrl(url: string): Promise<string> {
  let response: Response
  try {
    response = await fetch(url)
  } catch (err) {
    throw new Error(
      `Connection failed. Is ${url} accessible? (${err instanceof Error ? err.message : "unknown"})`,
    )
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const html = await response.text()
  const stripped = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200_000)

  if (stripped.length < MIN_SCRAPED_LENGTH) {
    throw new Error(
      `Scraped content is too short (${stripped.length} chars, need ${MIN_SCRAPED_LENGTH}+). ` +
        `The page may be JS-rendered, behind auth, or empty. ` +
        `Try a different URL or check the page in a browser first.`,
    )
  }

  return stripped
}

export interface GenerateOptions {
  /** Cleaned page content (markdown-ish text). */
  content: string
  /** Source URL, included in the prompt for grounding. */
  sourceUrl: string
  /** Model ID in provider/model form. Defaults to DEFAULT_MODEL. */
  model?: string
}

/**
 * Generate structured help articles from scraped page content.
 * Uses generateObject with a Zod schema so the output is type-safe.
 */
export async function generateArticlesFromContent({
  content,
  sourceUrl,
  model = DEFAULT_MODEL,
}: GenerateOptions): Promise<GeneratedArticle[]> {
  if (!process.env.AI_GATEWAY_API_KEY) {
    throw new MissingApiKeyError()
  }

  try {
    const { object } = await generateObject({
      model,
      schema: generatedArticlesSchema,
      prompt: buildPrompt(content, sourceUrl),
    })
    return object.articles
  } catch (err) {
    if (err instanceof MissingApiKeyError) throw err
    throw new GatewayError(
      err instanceof Error ? err.message : "Unknown gateway error",
      err,
    )
  }
}

/**
 * Builds the prompt sent to the LLM for article generation.
 *
 * This is the surface most open-source contributors will want to edit.
 * When you change anything in this function, run `pnpm smoke --baseline`
 * from the repo root to compare your change against the committed prompt.
 * See SMOKE.md for the grading rubric, cost expectation, and PR checklist.
 */
export function buildPrompt(content: string, sourceUrl: string): string {
  return `You are generating a help center for the product at ${sourceUrl}.

Read the scraped website content below and generate 4 to 6 high-quality help articles. If the source content clearly covers 6 or more distinct topics, prefer 6 over 4 — do not default to the floor when the material supports breadth.

Requirements for each article:

- Title: MUST start with "How to" followed by a verb, OR with an imperative verb. No gerunds ("-ing" forms), no noun phrases. Titles MUST NOT contain any of the banned marketing words listed under "Grounding rules" below (streamline, seamless, effortless, powerful, beautiful, robust, comprehensive, ultimate, cutting-edge) — this applies even when the word appears to be used as a verb.
  PASS: "How to reset your password", "Deploy to production", "Configure your custom domain", "Send your first email"
  FAIL: "Password resets", "Integrating AI models", "Optimizing app performance", "Getting started guide", "Streamline AI integration", "Build robust pipelines"
- Description: one plain sentence. No marketing language. Do NOT start with "Learn".
- Category: a natural human-readable name like "Getting Started", "Account & Billing", "Features", or "Troubleshooting".
- Tags: 2-4 tags. Lowercase. Single words or hyphen-joined compounds — never contain a space. Keep dots in technology names.
  PASS: ["deployment", "getting-started", "node.js", "bot-management"]
  FAIL: ["Deployment", "getting started", "Node.js", "bot management"]
- Content: MDX body. Do NOT include frontmatter — title/description are schema fields, not body content.

Content rules (each one is MANDATORY, not advisory):
- Structure: the body MUST contain at least 3 markdown \`## H2\` headings. Each \`##\` heading is followed by 2-5 sentences of prose and, when relevant, a fenced code block. Never write the body as a single long paragraph. The \`##\` headings are the section markers — numbered lists, bold text, and long paragraphs do NOT replace them. Articles with fewer than 3 \`##\` headings are rejected.
- Word count: minimum 150 words of prose across all sections combined (do not count words inside fenced code blocks). Distribute words across the sections; do not pile everything into one section. Before returning, count your prose words. If under 150, add concrete details to each section rather than inflating any single section.
- Do not imitate source density: if the source is a terse README or markdown doc, your output must still hit the 150-word floor per article and still use \`##\` headings. The goal is an end-user help center, not a mirror of the source.
- Fenced code blocks MUST open on their own line with three backticks followed by a language identifier (e.g. \`\`\`javascript), contain the code on subsequent lines, and close on their own line with three backticks. Never embed a fenced code block inside a paragraph or sentence. Never put prose and backticks on the same line.
- Include a fenced code example whenever the source content mentions any of the following: an API call, a CLI command, an SDK usage example, a request or response payload, a config file, an environment variable, or a shell install command (e.g. \`npm install\`, \`pip install\`, \`brew install\`).

Component palette (MDX components you may use in the article body):

Use these components when the content structure warrants it, not as a formula. Vary usage across articles.

<Callout type="tip">Short practical advice or best practice.</Callout>
<Callout type="warning">Something that could break or cause problems.</Callout>

<Steps>
  <Step title="First step">Body of step one with concrete instructions.</Step>
  <Step title="Second step">Body of step two.</Step>
  <Step title="Third step">Body of step three.</Step>
</Steps>

<Accordion>
  <AccordionItem title="Frequently asked question">Answer with concrete details.</AccordionItem>
  <AccordionItem title="Another question">Another answer.</AccordionItem>
</Accordion>

<CardGroup cols={2}>
  <Card icon="rocket" title="Related article" href="/category/article-slug">Short description of the linked article.</Card>
  <Card icon="book-open" title="Another article" href="/category/other-slug">Another short description.</Card>
</CardGroup>

Component rules:
- Use <Steps> for how-to articles with 3 or more sequential actions. Minimum 3 steps.
- Use <Callout type="tip"> for best practices, <Callout type="warning"> for gotchas. At most 2 callouts per article.
- Use <CardGroup> at the end of the article for 2-4 related links. Minimum 2 cards.
- Use <Accordion> for FAQ sections or edge cases. Minimum 2 items.
- Do NOT use <Figure>, <Video>, <CtaCard>, or <Tabs> in generated output. Those require real assets or human curation.
- Not every article needs Steps. Not every article needs CardGroup. Use components when the content structure warrants it.

Grounding rules:
- Do NOT invent features that are not mentioned in the scraped content.
- Prefer concrete steps over generic advice.
- Use the product's own naming and terminology when possible.
- Never use these marketing words anywhere (title, description, or body): streamline, seamless, effortless, powerful, beautiful, robust, comprehensive, ultimate, cutting-edge.
- Never start a sentence with "Learn" (e.g. "Learn how to...", "Learn the basics of...").

SCRAPED CONTENT:
${content}`
}

/**
 * Convert a generated article into a full MDX file string with frontmatter.
 * The frontmatter matches the Frontmatter schema in `./schemas.ts`.
 */
export function articleToMdx(
  article: GeneratedArticle,
  order: number,
): string {
  const tagsYaml =
    article.tags.length > 0
      ? `[${article.tags.map((t) => JSON.stringify(t)).join(", ")}]`
      : "[]"

  return `---
schemaVersion: 1
title: ${JSON.stringify(article.title)}
description: ${JSON.stringify(article.description)}
tags: ${tagsYaml}
order: ${order}
featured: false
---

${article.content.trim()}
`
}

export interface ArticleWritePlan {
  categorySlug: string
  categoryTitle: string
  articleSlug: string
  filePath: string
  mdx: string
}

/**
 * Pure planning: turn generated articles into a list of write operations.
 * Does NOT touch the filesystem. The CLI/scaffolder decides when to write.
 */
export function planArticleWrites(
  articles: GeneratedArticle[],
  outputDir: string,
): ArticleWritePlan[] {
  // Group articles by category slug so we can assign stable order values.
  const byCategory = new Map<string, GeneratedArticle[]>()
  for (const article of articles) {
    const key = slugify(article.category)
    const list = byCategory.get(key) ?? []
    list.push(article)
    byCategory.set(key, list)
  }

  const plans: ArticleWritePlan[] = []
  for (const [categorySlug, categoryArticles] of byCategory) {
    const categoryTitle = categoryArticles[0]!.category
    categoryArticles.forEach((article, index) => {
      const articleSlug = slugify(article.title)
      plans.push({
        categorySlug,
        categoryTitle,
        articleSlug,
        filePath: `${outputDir}/${categorySlug}/${articleSlug}.mdx`,
        mdx: articleToMdx(article, index + 1),
      })
    })
  }
  return plans
}
