import { z } from "zod"
import { searchDocs } from "../content/index.js"
import type { Doc } from "../content/loader.js"

export const searchDocsInput = z.object({
  query: z.string().min(1, "query must not be empty"),
  limit: z.number().int().positive().max(50).optional(),
})

export type SearchDocsInput = z.infer<typeof searchDocsInput>

export function handleSearchDocs(docs: Doc[], input: SearchDocsInput) {
  const limit = input.limit ?? 10
  const hits = searchDocs(docs, input.query).slice(0, limit)

  if (hits.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: `No docs matched "${input.query}".`,
        },
      ],
    }
  }

  const lines = hits.map((hit) => {
    const d = hit.doc
    const desc = d.description ? ` — ${d.description}` : ""
    return `- [${d.category}/${d.slug}] ${d.title}${desc}`
  })

  return {
    content: [
      {
        type: "text" as const,
        text: `Found ${hits.length} doc(s):\n${lines.join("\n")}`,
      },
    ],
  }
}
