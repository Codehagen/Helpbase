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
 * A citation produced by `helpbase ingest` — points at the specific file
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
  // Fields set by `helpbase ingest` on generated docs. Optional so hand-
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
 * Generated context doc — what the LLM returns for `helpbase ingest`. Extends
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

/**
 * Hosted tier (`helpbase deploy`) schemas — payload shapes for the
 * `deploy_tenant` RPC and the hosted MCP route. Single source of truth.
 */

/**
 * One search chunk uploaded by the CLI for a given article.
 * Keys `article_slug` and `article_category` are what the RPC joins on
 * to resolve `article_id` post-insert.
 */
export const tenantChunkSchema = z.object({
  article_slug: z.string().min(1),
  article_category: z.string().min(1),
  chunk_index: z.number().int().nonnegative(),
  content: z.string().min(1),
  file_path: z.string(),
  line_start: z.number().int().positive(),
  line_end: z.number().int().positive(),
  token_count: z.number().int().nonnegative().default(0),
}).refine((c) => c.line_end >= c.line_start, {
  message: "line_end must be >= line_start",
  path: ["line_end"],
})

export type TenantChunk = z.infer<typeof tenantChunkSchema>

/**
 * Per-deploy validation report, written to `tenant_deploys.validation_report`
 * JSONB. Mirrors the client-side report the CLI already generates in v2.
 */
export const deployReportSchema = z.object({
  kept_count: z.number().int().nonnegative(),
  dropped_count: z.number().int().nonnegative(),
  dropped: z.array(z.object({
    slug: z.string(),
    reason: z.string(),
  })).default([]),
  ran_at: z.string(),
})

export type DeployReport = z.infer<typeof deployReportSchema>

/**
 * The full payload the CLI hands to `deploy_tenant` RPC.
 * Categories + articles + chunks + validation report.
 */
export const deployPayloadSchema = z.object({
  categories: z.array(z.object({
    slug: z.string().min(1),
    title: z.string().min(1),
    description: z.string().default(""),
    icon: z.string().optional().nullable(),
    order: z.number().int().default(0),
  })),
  articles: z.array(z.object({
    slug: z.string().min(1),
    category: z.string().min(1),
    title: z.string().min(1),
    description: z.string().default(""),
    content: z.string(),
    // content_hash is required, not defaulted: an empty string persists
    // straight through to tenant_articles.content_hash and the diff
    // engine treats "" as UPDATED-forever until the next deploy. That's
    // a silent DX regression. The server recomputes on the deploy route
    // as belt-and-braces, but requiring at the schema level catches
    // malformed callers with a clear 400 before the RPC fires. Caught
    // by CodeRabbit on PR #11.
    content_hash: z.string().min(1, "content_hash is required (hash via hashArticle)"),
    frontmatter: z.record(z.string(), z.unknown()).default({}),
    order: z.number().int().default(0),
    tags: z.array(z.string()).optional().nullable(),
    hero_image: z.string().optional().nullable(),
    video_embed: z.string().optional().nullable(),
    featured: z.boolean().default(false),
    file_path: z.string(),
  })),
  chunks: z.array(tenantChunkSchema),
  validation_report: deployReportSchema.optional(),
  // Optimistic concurrency: client passes the deploy_version it observed
  // when fetching /state. Server raises stale_deploy_version (SQLSTATE P0001)
  // if the value has advanced since. Optional — CI and legacy callers
  // that don't run `deploy --preview` first pass undefined and skip the
  // check. See `deploy_tenant_rpc_v2_content_hash_and_version` migration.
  expected_deploy_version: z.number().int().nonnegative().nullable().optional(),
})

export type DeployPayload = z.infer<typeof deployPayloadSchema>

/**
 * MCP tool-call log entry for `tenant_mcp_queries`. Week-1 instrumentation
 * to decide whether FTS retrieval is good enough or we need pgvector.
 */
export const tenantMcpQuerySchema = z.object({
  tenant_id: z.string().uuid(),
  tool_name: z.enum(["search_docs", "get_doc", "list_docs"]),
  query: z.string().default(""),
  result_count: z.number().int().nonnegative(),
  matched: z.boolean(),
})

export type TenantMcpQuery = z.infer<typeof tenantMcpQuerySchema>
