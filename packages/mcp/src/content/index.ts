import type { Doc } from "./loader.js"
import type { Embedder, SearchIndex } from "./semantic.js"
import { semanticSearch } from "./semantic.js"

export interface SearchHit {
  doc: Doc
  score: number
}

export interface SearchOptions {
  /** When provided, the search dispatches to semanticSearch. */
  index?: SearchIndex
  /** Optional override for the embedder (used by tests and power users). */
  embedder?: Embedder
}

/**
 * Unified search entrypoint. Dispatches to semantic search when an index is
 * provided, otherwise falls back to the small keyword ranker below.
 *
 * Returning a Promise always (even in the keyword path) keeps the call-site
 * signature stable — the tool handler doesn't have to care which path ran.
 */
export async function searchDocs(
  docs: Doc[],
  query: string,
  options: SearchOptions = {},
): Promise<SearchHit[]> {
  if (options.index) {
    return semanticSearch(docs, query, options.index, {
      embedder: options.embedder,
    })
  }
  return keywordSearch(docs, query)
}

/**
 * Very small keyword-match search. Lowercases both sides, splits the query on
 * whitespace, scores each doc by:
 *   +5 per query term in title
 *   +3 per query term in description
 *   +1 per query term in body (capped at 5 occurrences to avoid term-spam boost)
 *
 * This is the fallback path when no semantic index is loaded.
 */
export function keywordSearch(docs: Doc[], query: string): SearchHit[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)

  if (terms.length === 0) return []

  const hits: SearchHit[] = []
  for (const doc of docs) {
    const title = doc.title.toLowerCase()
    const description = doc.description.toLowerCase()
    const body = doc.content.toLowerCase()
    let score = 0

    for (const term of terms) {
      if (title.includes(term)) score += 5
      if (description.includes(term)) score += 3
      const bodyMatches = countOccurrences(body, term)
      score += Math.min(bodyMatches, 5)
    }

    if (score > 0) hits.push({ doc, score })
  }

  hits.sort((a, b) => b.score - a.score)
  return hits
}

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0
  let count = 0
  let idx = 0
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count += 1
    idx += needle.length
  }
  return count
}
