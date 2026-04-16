import fs from "node:fs"
import path from "node:path"
import { generatedArticlesSchema, type GeneratedArticle } from "./schemas.js"
import {
  DEFAULT_MODEL,
  MissingApiKeyError,
  GatewayError,
  callGenerator,
} from "./ai.js"

/**
 * Text-based article generation from scraped URL content.
 *
 * This module handles the original --url generation flow:
 *   fetch URL → strip HTML → send text to LLM → structured articles
 */

// ── Scraping ───────────────────────────────────────────────────────

/**
 * Minimum stripped-text length for a page to be considered usable.
 */
export const MIN_SCRAPED_LENGTH = 500

/**
 * Fetch a URL and return a cleaned text representation.
 * Strips scripts, styles, and tags; collapses whitespace.
 * Caps at 200k chars.
 */
export async function scrapeUrl(url: string): Promise<string> {
  let response: Response
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(30_000),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown"
    const isTimeout = err instanceof Error && err.name === "TimeoutError"
    throw new Error(
      isTimeout
        ? `Request timed out after 30 seconds. Is ${url} responsive?`
        : `Connection failed. Is ${url} accessible? (${msg})`,
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

// ── Repo reading ───────────────────────────────────────────────────

/**
 * Max total characters of repo content concatenated before it's sent to the
 * LLM. Matches the cap used by `scrapeUrl` — most models handle ~200k chars
 * of English text within a 1M context window, with room to spare for the
 * system prompt and output.
 */
export const MAX_REPO_CONTENT_CHARS = 200_000

// Kept local to avoid a circular import between shared modules; these live
// in a dedicated `./secrets.ts` module that both `ai-text` (walker) and the
// CLI `context` command import from.
import { isSecretFile } from "./secrets.js"

const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx", ".markdown"])

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".next",
  ".turbo",
  ".vercel",
  ".cache",
  "coverage",
  ".helpbase",
])

function walkMarkdownFiles(rootDir: string): string[] {
  const results: string[] = []
  const stack: string[] = [rootDir]
  while (stack.length) {
    const current = stack.pop()!
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== "." && entry.name !== "..") {
        if (entry.isDirectory() && !SKIP_DIR_NAMES.has(entry.name)) continue
      }
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIR_NAMES.has(entry.name)) continue
        stack.push(full)
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (MARKDOWN_EXTENSIONS.has(ext)) {
          // Drop files whose NAMES indicate a secret (.env*, *.pem, *.key, ...).
          // Content-level secret scanning runs separately in helpbase context;
          // this gate protects even generate --repo from slurping secrets into
          // an LLM prompt.
          if (isSecretFile(entry.name)) continue
          results.push(full)
        }
      }
    }
  }
  return results
}

/**
 * Read markdown files from a local repository path and concatenate them into
 * a single string suitable for `generateArticlesFromContent`.
 *
 * - Walks the directory recursively, skipping build output and VCS dirs.
 * - Picks up `.md`, `.mdx`, `.markdown` files.
 * - Sorts README-like files first so the prompt leads with the repo overview.
 * - Prefixes each file with a `===== <relative path> =====` header so the
 *   LLM can tell where content boundaries are.
 * - Caps total output at MAX_REPO_CONTENT_CHARS.
 */
export async function readRepoContent(repoPath: string): Promise<string> {
  const abs = path.resolve(repoPath)
  let stat: fs.Stats
  try {
    stat = fs.statSync(abs)
  } catch {
    throw new Error(
      `Repository path does not exist: ${abs}. ` +
        `Pass a path to a local directory containing markdown files.`,
    )
  }
  if (!stat.isDirectory()) {
    throw new Error(
      `Repository path is not a directory: ${abs}. ` +
        `Pass a path to a local directory, not a file.`,
    )
  }

  const files = walkMarkdownFiles(abs)
  if (files.length === 0) {
    throw new Error(
      `No markdown files found in ${abs}. ` +
        `Helpbase reads .md, .mdx, and .markdown files — ` +
        `check the path or add a README.`,
    )
  }

  // README-style files first; then shallower paths; then alphabetical.
  files.sort((a, b) => {
    const aName = path.basename(a).toLowerCase()
    const bName = path.basename(b).toLowerCase()
    const aIsReadme = aName.startsWith("readme.")
    const bIsReadme = bName.startsWith("readme.")
    if (aIsReadme !== bIsReadme) return aIsReadme ? -1 : 1
    const aDepth = a.split(path.sep).length
    const bDepth = b.split(path.sep).length
    if (aDepth !== bDepth) return aDepth - bDepth
    return a.localeCompare(b)
  })

  const parts: string[] = []
  let total = 0
  for (const file of files) {
    let body: string
    try {
      body = fs.readFileSync(file, "utf-8")
    } catch {
      continue
    }
    const rel = path.relative(abs, file)
    const header = `\n===== ${rel} =====\n`
    const chunk = header + body + "\n"
    if (total + chunk.length > MAX_REPO_CONTENT_CHARS) {
      const remaining = MAX_REPO_CONTENT_CHARS - total
      if (remaining > header.length + 100) {
        parts.push(chunk.slice(0, remaining))
        total = MAX_REPO_CONTENT_CHARS
      }
      break
    }
    parts.push(chunk)
    total += chunk.length
  }

  const combined = parts.join("").trim()
  if (combined.length < MIN_SCRAPED_LENGTH) {
    throw new Error(
      `Repository has only ${combined.length} chars of markdown content ` +
        `(need ${MIN_SCRAPED_LENGTH}+). Add a README or more docs, ` +
        `then re-run.`,
    )
  }
  return combined
}

// ── Text generation ────────────────────────────────────────────────

export interface GenerateOptions {
  content: string
  sourceUrl: string
  model?: string
}

/**
 * Generate structured help articles from scraped page content.
 */
export async function generateArticlesFromContent({
  content,
  sourceUrl,
  model = DEFAULT_MODEL,
}: GenerateOptions): Promise<GeneratedArticle[]> {
  const result = await callGenerator<{ articles: GeneratedArticle[] }>({
    model,
    prompt: buildPrompt(content, sourceUrl),
    schema: generatedArticlesSchema,
  })
  return result.articles
}

// ── Prompt ─────────────────────────────────────────────────────────

/**
 * Builds the prompt sent to the LLM for text-based article generation.
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
