import { getAllArticles, getCategories } from "./content"
import { buildSearchIndex, type SearchItem } from "./search-index"

export type { SearchItem }
export { buildSearchIndex }

export async function getSearchIndex(): Promise<SearchItem[]> {
  const [articles, categories] = await Promise.all([
    getAllArticles(),
    getCategories(),
  ])
  return buildSearchIndex(articles, categories)
}
