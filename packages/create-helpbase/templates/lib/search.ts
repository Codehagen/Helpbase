import { getAllArticles, getCategories } from "./content"

export interface SearchItem {
  title: string
  description: string
  category: string
  categoryTitle: string
  slug: string
  href: string
}

export async function getSearchIndex(): Promise<SearchItem[]> {
  const [articles, categories] = await Promise.all([
    getAllArticles(),
    getCategories(),
  ])

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
