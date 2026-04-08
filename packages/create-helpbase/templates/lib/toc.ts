import type { TocItem } from "@/lib/types"
import { slugify } from "@/lib/slugify"

/**
 * Extract table of contents from raw MDX content.
 * Parses h2 and h3 headings. Uses the same slugify function
 * that rehype-slug uses for consistency.
 */
export function extractToc(rawMdx: string): TocItem[] {
  const toc: TocItem[] = []
  const lines = rawMdx.split("\n")
  let inCodeBlock = false

  for (const line of lines) {
    // Skip headings inside code blocks
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) continue

    const match = line.match(/^(#{2,3})\s+(.+)$/)
    if (match) {
      const text = match[2]!.trim()
      toc.push({
        depth: match[1]!.length,
        text,
        id: slugify(text),
      })
    }
  }

  return toc
}
