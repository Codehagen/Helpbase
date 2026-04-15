import { z } from "zod"
import type { Doc } from "../content/loader.js"

export const getDocInput = z.object({
  slug: z
    .string()
    .min(1, "slug must not be empty")
    .describe("Either 'category/slug' or just 'slug' (first match wins)"),
})

export type GetDocInput = z.infer<typeof getDocInput>

export function handleGetDoc(docs: Doc[], input: GetDocInput) {
  const raw = input.slug.trim()
  const [categoryPart, slugPart] = raw.includes("/")
    ? raw.split("/", 2)
    : [undefined, raw]

  const match = docs.find((d) => {
    if (categoryPart !== undefined && slugPart !== undefined) {
      return d.category === categoryPart && d.slug === slugPart
    }
    return d.slug === slugPart
  })

  if (!match) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: `No doc found for "${raw}". Use list_docs to see available slugs.`,
        },
      ],
    }
  }

  const header = [
    `# ${match.title}`,
    match.description ? `> ${match.description}` : "",
    `Path: ${match.category}/${match.slug}`,
    "",
  ]
    .filter((l) => l.length > 0)
    .join("\n")

  return {
    content: [
      {
        type: "text" as const,
        text: `${header}\n\n${match.content}`,
      },
    ],
  }
}
