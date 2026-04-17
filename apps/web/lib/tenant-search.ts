import {
  getTenantArticles,
  getTenantCategories,
} from "./tenant-content"
import type { SearchItem } from "./search"

/**
 * Build the ⌘K search index for a tenant subdomain.
 *
 * Parallel to lib/search.ts#getSearchIndex which powers the apex docs
 * site. Same SearchItem shape so the SearchDialog component doesn't
 * need to know which surface it's rendering on — one component, two
 * data sources.
 */
export async function getTenantSearchIndex(
  tenantId: string,
): Promise<SearchItem[]> {
  const [articles, categories] = await Promise.all([
    getTenantArticles(tenantId),
    getTenantCategories(tenantId),
  ])

  const categoryTitles = new Map(categories.map((c) => [c.slug, c.title]))

  return articles.map((article) => ({
    title: article.title,
    description: article.description ?? "",
    category: article.category,
    categoryTitle: categoryTitles.get(article.category) ?? article.category,
    slug: article.slug,
    href: `/${article.category}/${article.slug}`,
  }))
}
