import { z } from "zod"
import type { Doc, CategoryMeta } from "../content/loader.js"

export const listDocsInput = z.object({
  category: z
    .string()
    .optional()
    .describe("Filter to a single category slug. Omit to list everything."),
})

export type ListDocsInput = z.infer<typeof listDocsInput>

export function handleListDocs(
  docs: Doc[],
  categories: CategoryMeta[],
  input: ListDocsInput,
) {
  const filter = input.category?.trim()
  const visible = filter ? docs.filter((d) => d.category === filter) : docs

  if (visible.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: filter
            ? `No docs found in category "${filter}".`
            : "No docs available.",
        },
      ],
    }
  }

  const categoryOrder = new Map(categories.map((c, i) => [c.slug, i]))
  const categoryTitles = new Map(categories.map((c) => [c.slug, c.title]))

  const groups = new Map<string, Doc[]>()
  for (const d of visible) {
    const existing = groups.get(d.category) ?? []
    existing.push(d)
    groups.set(d.category, existing)
  }

  const sortedCats = Array.from(groups.keys()).sort((a, b) => {
    const oa = categoryOrder.get(a) ?? 999
    const ob = categoryOrder.get(b) ?? 999
    if (oa !== ob) return oa - ob
    return a.localeCompare(b)
  })

  const lines: string[] = []
  for (const cat of sortedCats) {
    const title = categoryTitles.get(cat) ?? cat
    lines.push(`## ${title}`)
    for (const doc of groups.get(cat)!) {
      const desc = doc.description ? ` — ${doc.description}` : ""
      lines.push(`- ${cat}/${doc.slug}: ${doc.title}${desc}`)
    }
    lines.push("")
  }

  return {
    content: [
      {
        type: "text" as const,
        text: lines.join("\n").trim(),
      },
    ],
  }
}
