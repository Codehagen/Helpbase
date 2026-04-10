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
