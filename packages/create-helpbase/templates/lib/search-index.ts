import type { ArticleMeta, Category } from "@/lib/types"

export interface SearchItem {
  title: string
  description: string
  category: string
  categoryTitle: string
  slug: string
  href: string
}

/**
 * Pure function — given articles + categories, build the search index.
 * Lives in its own file so tests can import it without pulling in the
 * MDX/content IO layer (which can't be parsed by vitest's default
 * transformer).
 */
export function buildSearchIndex(
  articles: ArticleMeta[],
  categories: Category[]
): SearchItem[] {
  const categoryMap = new Map(categories.map((c) => [c.slug, c.title]))

  return articles.map((article) => ({
    title: article.title,
    description: article.description,
    category: article.category,
    categoryTitle: categoryMap.get(article.category) ?? article.category,
    slug: article.slug,
    href: `/${article.category}/${article.slug}`,
  }))
}
