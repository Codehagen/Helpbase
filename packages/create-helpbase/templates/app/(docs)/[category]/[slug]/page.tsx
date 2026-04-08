import Link from "next/link"
import { notFound } from "next/navigation"
import {
  getAllArticles,
  getArticle,
  getAdjacentArticles,
} from "@/lib/content"
import { titleCase } from "@/lib/slugify"
import { Badge } from "@/components/ui/badge"
import { TableOfContents } from "@/components/toc"

export async function generateStaticParams() {
  const articles = await getAllArticles()
  return articles.map((a) => ({
    category: a.category,
    slug: a.slug,
  }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string; slug: string }>
}) {
  const { category, slug } = await params
  const article = await getArticle(category, slug)
  if (!article) return {}

  return {
    title: article.title,
    description: article.description,
  }
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ category: string; slug: string }>
}) {
  const { category, slug } = await params
  const article = await getArticle(category, slug)

  if (!article) notFound()

  const { prev, next } = await getAdjacentArticles(category, slug)

  return (
    <div className="flex">
      {/* Main content area */}
      <div className="min-w-0 flex-1 px-8 py-10 lg:px-12">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link href="/" className="transition-colors hover:text-foreground">
            Home
          </Link>
          <ChevronIcon />
          <Link
            href={`/${category}`}
            className="transition-colors hover:text-foreground"
          >
            {titleCase(category)}
          </Link>
          <ChevronIcon />
          <span className="truncate text-foreground">{article.title}</span>
        </nav>

        <article>
          <header className="mb-10">
            <h1 className="text-3xl font-bold tracking-tight">
              {article.title}
            </h1>
            <p className="mt-3 text-lg leading-relaxed text-muted-foreground">
              {article.description}
            </p>
            {article.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {article.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </header>

          {/* MDX content */}
          <div className="article-content max-w-none">
            {article.content}
          </div>

          {/* Prev/Next navigation */}
          <div className="mt-16 grid grid-cols-2 gap-4 border-t border-border pt-8">
            {prev ? (
              <Link
                href={`/${prev.category}/${prev.slug}`}
                className="group flex flex-col gap-1 rounded-xl border border-border p-4 transition-[border-color,background-color] duration-150 ease-out hover:border-foreground/15 hover:bg-muted/30"
              >
                <span className="text-xs text-muted-foreground">Previous</span>
                <span className="text-sm font-medium group-hover:text-foreground">
                  {prev.title}
                </span>
              </Link>
            ) : (
              <div />
            )}
            {next ? (
              <Link
                href={`/${next.category}/${next.slug}`}
                className="group flex flex-col items-end gap-1 rounded-xl border border-border p-4 text-right transition-[border-color,background-color] duration-150 ease-out hover:border-foreground/15 hover:bg-muted/30"
              >
                <span className="text-xs text-muted-foreground">Next</span>
                <span className="text-sm font-medium group-hover:text-foreground">
                  {next.title}
                </span>
              </Link>
            ) : (
              <div />
            )}
          </div>
        </article>
      </div>

      {/* TOC sidebar */}
      {article.toc.length > 0 && (
        <aside className="hidden w-52 shrink-0 xl:block">
          <div className="sticky top-14 h-[calc(100svh-3.5rem)] overflow-y-auto px-4 py-10">
            <h4 className="mb-4 pl-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              On this page
            </h4>
            <TableOfContents items={article.toc} />
          </div>
        </aside>
      )}
    </div>
  )
}

function ChevronIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5">
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}
