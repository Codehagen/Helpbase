import fs from "node:fs"
import path from "node:path"
import matter from "gray-matter"
import { compileMDX } from "next-mdx-remote/rsc"
import { cache } from "react"
import { remarkPlugins, rehypePlugins } from "./mdx-config"

import { frontmatterSchema, categoryMetaSchema } from "@/lib/schemas"
import type { ArticleMeta, Article, Category, TocItem } from "@/lib/types"
import { titleCase } from "@/lib/slugify"
import { extractToc } from "./toc"
import { createArticleComponents } from "./mdx-components"
import { resolveContentDir } from "./content-dir"

const CONTENT_DIR = resolveContentDir()

/**
 * Get all articles (frontmatter only, no compiled content).
 * Fails loudly on invalid frontmatter — never silently drops articles.
 */
export const getAllArticles = cache(async (): Promise<ArticleMeta[]> => {
  const articles: ArticleMeta[] = []
  const errors: string[] = []

  if (!fs.existsSync(CONTENT_DIR)) {
    return []
  }

  const categoryDirs = fs
    .readdirSync(CONTENT_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())

  for (const dir of categoryDirs) {
    const categorySlug = dir.name
    const categoryPath = path.join(CONTENT_DIR, categorySlug)
    const files = fs
      .readdirSync(categoryPath)
      .filter((f) => f.endsWith(".mdx") || f.endsWith(".md"))

    for (const file of files) {
      const filePath = path.join(categoryPath, file)
      const raw = fs.readFileSync(filePath, "utf-8")
      const { data, content } = matter(raw)

      const parsed = frontmatterSchema.safeParse(data)
      if (!parsed.success) {
        errors.push(
          `${categorySlug}/${file}: ${parsed.error.issues.map((i) => i.message).join(", ")}`
        )
        continue
      }

      const slug = file.replace(/\.mdx?$/, "")
      articles.push({
        ...parsed.data,
        slug,
        category: categorySlug,
        filePath: `content/${categorySlug}/${file}`,
        rawContent: content,
      })
    }
  }

  // Fail the build on invalid articles (never silently drop content)
  if (errors.length > 0 && process.env.NODE_ENV === "production") {
    throw new Error(
      `Invalid frontmatter in ${errors.length} article(s):\n${errors.map((e) => `  - ${e}`).join("\n")}\n\nFix these issues or run 'helpcenter audit' for details.`
    )
  } else if (errors.length > 0) {
    console.warn(
      `⚠ Skipping ${errors.length} article(s) with invalid frontmatter:\n${errors.map((e) => `  - ${e}`).join("\n")}`
    )
  }

  return articles.sort((a, b) => a.order - b.order)
})

/**
 * Get all categories with their articles.
 */
export const getCategories = cache(async (): Promise<Category[]> => {
  const articles = await getAllArticles()

  if (!fs.existsSync(CONTENT_DIR)) {
    return []
  }

  const categoryDirs = fs
    .readdirSync(CONTENT_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())

  const categories: Category[] = categoryDirs.map((dir) => {
    const slug = dir.name
    const metaPath = path.join(CONTENT_DIR, slug, "_category.json")

    let meta = { title: titleCase(slug), description: "", icon: "file-text", order: 999 }
    if (fs.existsSync(metaPath)) {
      const raw = JSON.parse(fs.readFileSync(metaPath, "utf-8"))
      const parsed = categoryMetaSchema.safeParse(raw)
      if (parsed.success) {
        meta = parsed.data
      }
    }

    return {
      slug,
      ...meta,
      articles: articles.filter((a) => a.category === slug),
    }
  })

  return categories.sort((a, b) => a.order - b.order)
})

/**
 * Get a single article with compiled MDX content and TOC.
 */
export const getArticle = cache(
  async (category: string, slug: string): Promise<Article | null> => {
    const extensions = [".mdx", ".md"]
    let filePath: string | null = null
    let rawFile: string | null = null

    for (const ext of extensions) {
      const candidate = path.join(CONTENT_DIR, category, `${slug}${ext}`)
      if (fs.existsSync(candidate)) {
        filePath = candidate
        rawFile = fs.readFileSync(candidate, "utf-8")
        break
      }
    }

    if (!filePath || !rawFile) return null

    const { data, content: rawContent } = matter(rawFile)
    const parsed = frontmatterSchema.safeParse(data)
    if (!parsed.success) return null

    const toc = extractToc(rawContent)

    const { content } = await compileMDX({
      source: rawContent,
      components: createArticleComponents(category, slug),
      options: {
        mdxOptions: {
          remarkPlugins,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          rehypePlugins: rehypePlugins as any,
        },
      },
    })

    return {
      ...parsed.data,
      slug,
      category,
      filePath: `content/${category}/${slug}.mdx`,
      content,
      toc,
    }
  }
)

/**
 * Get featured articles for the homepage.
 */
export const getFeaturedArticles = cache(async (): Promise<ArticleMeta[]> => {
  const articles = await getAllArticles()
  return articles.filter((a) => a.featured).slice(0, 6)
})

/**
 * Get previous and next articles for navigation.
 */
export const getAdjacentArticles = cache(
  async (
    category: string,
    slug: string
  ): Promise<{ prev: ArticleMeta | null; next: ArticleMeta | null }> => {
    const articles = await getAllArticles()
    const categoryArticles = articles.filter((a) => a.category === category)
    const index = categoryArticles.findIndex((a) => a.slug === slug)

    return {
      prev: index > 0 ? categoryArticles[index - 1]! : null,
      next: index < categoryArticles.length - 1 ? categoryArticles[index + 1]! : null,
    }
  }
)
