import type { Frontmatter, CategoryMeta } from "./schemas"

export type { Frontmatter, CategoryMeta }

/**
 * An article's metadata (frontmatter + file info), without compiled content.
 */
export interface ArticleMeta extends Frontmatter {
  slug: string
  category: string
  filePath: string
  rawContent?: string
}

/**
 * A fully loaded article with compiled MDX content.
 */
export interface Article extends ArticleMeta {
  content: React.ReactElement
  toc: TocItem[]
}

/**
 * A category with its articles.
 */
export interface Category {
  slug: string
  title: string
  description: string
  icon: string
  order: number
  articles: ArticleMeta[]
}

/**
 * A table of contents entry.
 */
export interface TocItem {
  depth: number // 2 | 3
  text: string
  id: string
}
