import fs from "node:fs/promises"
import path from "node:path"
import matter from "gray-matter"
import { resolveContentDir } from "@/lib/content-dir"
import { renderArticleAsMarkdown } from "@/lib/markdown-render"
import { frontmatterSchema } from "@workspace/shared/schemas"

export const revalidate = 3600

/**
 * Serves the markdown representation of a docs article at
 *   GET /api/md/{category}/{slug}
 *
 * Reached via rewrite from proxy.ts when the client negotiates
 * Accept: text/markdown on an article path, or fetches an explicit
 * .md URL. Returns body-only (no YAML frontmatter) with `# ${title}`
 * prepended so the response is a complete, context-rich document.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ category: string; slug: string }> },
) {
  const { category, slug } = await params
  const dir = resolveContentDir()

  // Path-traversal hardening. Category + slug come from URL params the
  // proxy hands us, but belt-and-suspenders: reject segments with slashes
  // or `..` before touching the filesystem.
  if (
    category.includes("/") ||
    category.includes("\\") ||
    category.includes("..") ||
    slug.includes("/") ||
    slug.includes("\\") ||
    slug.includes("..")
  ) {
    return new Response("Not Found", { status: 404 })
  }

  for (const ext of [".mdx", ".md"]) {
    const candidate = path.join(dir, category, slug + ext)
    try {
      const raw = await fs.readFile(candidate, "utf-8")
      const { data, content } = matter(raw)
      const parsed = frontmatterSchema.safeParse(data)
      if (!parsed.success) {
        // Match the HTML page's 404 behavior on bad frontmatter rather
        // than serving a half-formed response.
        return new Response("Not Found", { status: 404 })
      }
      const body = renderArticleAsMarkdown({
        title: parsed.data.title,
        description: parsed.data.description,
        body: content,
      })
      return new Response(body, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Vary": "Accept",
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=86400",
          "X-Content-Type-Options": "nosniff",
        },
      })
    } catch (err) {
      const code = (err as NodeJS.ErrnoException | undefined)?.code
      if (code === "ENOENT") continue
      throw err
    }
  }

  return new Response("Not Found", { status: 404 })
}
