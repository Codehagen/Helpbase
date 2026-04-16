import { z } from "zod"

/**
 * Article frontmatter schema.
 * This is the single source of truth for content validation —
 * used by the CLI, audit, and the web app.
 */
/**
 * Allowed hosts for videoEmbed iframe URLs.
 * Prevents arbitrary iframe injection while supporting common video platforms.
 */
export const EMBED_HOST_ALLOWLIST = [
  "youtube.com",
  "www.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  "loom.com",
  "www.loom.com",
  "vimeo.com",
  "player.vimeo.com",
  "supercut.ai",
] as const

function isAllowedEmbedHost(url: string): boolean {
  try {
    const parsed = new URL(url)
    return EMBED_HOST_ALLOWLIST.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`),
    )
  } catch {
    return false
  }
}

/**
 * A citation produced by `helpbase context` — points at the specific file
 * + line range that justifies a generated how-to guide.
 *
 * v2 contract: the LLM returns `{ file, startLine, endLine, reason? }` and
 * the CLI reads literal bytes from disk at that line range. Decoupling the
 * snippet from the model eliminates the paraphrase-drift failure mode that
 * made v1 unusable on cheaper models (see context dogfood, 2026-04-16).
 *
 * `snippet` is optional: absent on fresh model output, filled in by the CLI
 * from disk bytes before MDX write. Kept readable in the schema so v1
 * committed docs (with literal snippets) keep parsing without a migration.
 *
 *   file       — repo-relative path (e.g. "src/routes/auth.ts")
 *   startLine  — 1-indexed inclusive
 *   endLine    — 1-indexed inclusive, >= startLine
 *   reason     — one short sentence on why this range supports the claim
 *   snippet    — disk bytes from [startLine, endLine] (CLI-populated at write)
 */
export const contextCitationSchema = z
  .object({
    file: z.string().min(1, "file is required"),
    startLine: z.number().int().positive("startLine must be >= 1"),
    endLine: z.number().int().positive("endLine must be >= 1"),
    reason: z.string().optional(),
    snippet: z.string().optional(),
  })
  .refine((c) => c.endLine >= c.startLine, {
    message: "endLine must be >= startLine",
    path: ["endLine"],
  })

export type ContextCitation = z.infer<typeof contextCitationSchema>

export const frontmatterSchema = z.object({
  schemaVersion: z.number({
    error: "schemaVersion is required. Add 'schemaVersion: 1' to your frontmatter.",
  }),
  title: z.string().min(1, "title is required"),
  description: z.string().min(1, "description is required"),
  category: z.string().optional(),
  tags: z.array(z.string()).default([]),
  order: z.number().default(999),
  featured: z.boolean().default(false),
  heroImage: z.string().optional(),
  coverImage: z.string().optional(),
  videoEmbed: z
    .string()
    .url("videoEmbed must be a valid URL")
    .refine(isAllowedEmbedHost, {
      message: `videoEmbed must be from an allowed host: ${EMBED_HOST_ALLOWLIST.filter((h) => !h.startsWith("www.") && !h.startsWith("player.")).join(", ")}`,
    })
    .optional(),
  ogImage: z.string().optional(),
  // Fields set by `helpbase context` on generated docs. Optional so hand-
  // written articles and scaffolded content keep validating unchanged.
  citations: z.array(contextCitationSchema).optional(),
  source: z.enum(["generated", "custom"]).optional(),
  helpbaseContextVersion: z.string().optional(),
})

export type Frontmatter = z.infer<typeof frontmatterSchema>

/**
 * Category metadata schema (for _category.json files).
 */
export const categoryMetaSchema = z.object({
  title: z.string(),
  description: z.string().default(""),
  icon: z.string().default("file-text"),
  order: z.number().default(999),
})

export type CategoryMeta = z.infer<typeof categoryMetaSchema>

/**
 * Generated article schema (from AI generation).
 * Used with Vercel AI SDK's generateObject via AI Gateway.
 *
 * Field contracts for the model:
 * - title: action-oriented, e.g. "How to reset your password"
 * - description: one plain sentence (no marketing copy)
 * - category: human-readable category name, e.g. "Getting Started"
 *   (the CLI slugifies this for the directory name)
 * - tags: 2-4 relevant tags, lowercase
 * - content: MDX body without frontmatter (the CLI wraps it)
 */
export const generatedArticleSchema = z.object({
  title: z.string(),
  description: z.string(),
  category: z.string(),
  tags: z.array(z.string()),
  content: z.string(),
})

export const generatedArticlesSchema = z.object({
  articles: z.array(generatedArticleSchema),
})

export type GeneratedArticle = z.infer<typeof generatedArticleSchema>

/**
 * Generated context doc — what the LLM returns for `helpbase context`. Extends
 * the article shape with citations (1–5 per doc, enforced; literal-text
 * validated before write) and a list of source file paths the model was
 * inspired by. Dropped docs (zero valid citations) never reach disk.
 */
export const generatedContextDocSchema = generatedArticleSchema.extend({
  citations: z
    .array(contextCitationSchema)
    .min(1, "at least 1 citation is required")
    .max(5, "at most 5 citations per doc"),
  sourcePaths: z.array(z.string()).default([]),
})

export const generatedContextDocsSchema = z.object({
  docs: z.array(generatedContextDocSchema),
})

export type GeneratedContextDoc = z.infer<typeof generatedContextDocSchema>

/**
 * An image associated with a generated article.
 * Used by the visual generation pipeline (--screenshots flag).
 *
 * Each image maps 1:1 to a <Step> block. When no <Steps> are present,
 * `step` is treated as an ordinal position (Figure N inserted after
 * the Nth prose paragraph).
 */
/**
 * A citation pointing at the specific lines of source code that justify a
 * proposed documentation edit. Every SyncProposal MUST carry at least one.
 *
 * This is the anti-hallucination gate: a proposal with zero citations cannot
 * be trusted to reflect the actual code change, so the schema rejects it.
 *
 *   sourceFile  — repo-relative path, e.g. "src/server.ts"
 *   lineStart   — 1-indexed inclusive
 *   lineEnd     — 1-indexed inclusive, >= lineStart
 */
export const syncCitationSchema = z
  .object({
    sourceFile: z.string().min(1, "sourceFile is required"),
    lineStart: z.number().int().positive("lineStart must be >= 1"),
    lineEnd: z.number().int().positive("lineEnd must be >= 1"),
  })
  .refine((c) => c.lineEnd >= c.lineStart, {
    message: "lineEnd must be >= lineStart",
    path: ["lineEnd"],
  })

/**
 * A proposed edit to a single MDX file, grounded in source code citations.
 *
 * The LLM returns an array of these; the CLI converts them into a unified
 * diff locally. `before` and `after` are the exact string contents — the
 * CLI does a literal find-and-replace when applying the proposal, so
 * `before` must match the current file content byte-for-byte.
 *
 * A citations array with zero items is rejected by the schema. This is
 * the property test invariant in `schemas.test.ts`.
 */
export const syncProposalSchema = z.object({
  file: z.string().min(1, "file path is required"),
  before: z.string(),
  after: z.string(),
  citations: z.array(syncCitationSchema).min(1, "at least one citation is required"),
  rationale: z.string().optional(),
})

export const syncProposalsSchema = z.object({
  proposals: z.array(syncProposalSchema),
})

export type SyncCitation = z.infer<typeof syncCitationSchema>
export type SyncProposal = z.infer<typeof syncProposalSchema>
export type SyncProposals = z.infer<typeof syncProposalsSchema>

export interface ArticleImage {
  /** Source filename, e.g. "01-dashboard.png" */
  filename: string
  /** AI-generated description of what the screenshot shows */
  alt: string
  /** Which Step this image belongs to (1-indexed) */
  step: number
}
