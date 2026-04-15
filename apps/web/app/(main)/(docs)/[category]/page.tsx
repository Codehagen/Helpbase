import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowRight, ChevronRight } from "lucide-react"

import { getCategories } from "@/lib/content"

export async function generateStaticParams() {
  const categories = await getCategories()
  return categories.map((c) => ({ category: c.slug }))
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>
}) {
  const { category: categorySlug } = await params
  const categories = await getCategories()
  const category = categories.find((c) => c.slug === categorySlug)

  if (!category) notFound()

  const articleCount = category.articles.length

  return (
    <div className="max-w-3xl px-8 py-12 lg:px-12">
      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="mb-8 flex items-center gap-1.5 text-sm text-muted-foreground"
      >
        <Link href="/" className="transition-colors hover:text-foreground">
          Home
        </Link>
        <ChevronRight
          className="size-3.5 text-muted-foreground/60"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <span className="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
          {category.title}
        </span>
      </nav>

      {/* Header */}
      <header className="mb-10">
        <p className="mb-3 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
          Category · {articleCount} article{articleCount !== 1 ? "s" : ""}
        </p>
        <h1 className="font-serif text-5xl leading-[1.1] tracking-tight text-foreground sm:text-6xl">
          {category.title}
        </h1>
        {category.description && (
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            {category.description}
          </p>
        )}
      </header>

      <hr className="mb-2 border-t border-border/80" />

      {/* Articles — editorial list */}
      {articleCount > 0 ? (
        <ul className="divide-y divide-border/80">
          {category.articles.map((article) => (
            <li key={article.slug}>
              <Link
                href={`/${categorySlug}/${article.slug}`}
                className="group flex items-start justify-between gap-6 py-6 transition-colors hover:bg-surface/50 -mx-4 px-4 rounded-md"
              >
                <div className="min-w-0 flex-1">
                  <h2 className="font-serif text-2xl leading-snug tracking-tight text-foreground group-hover:text-primary transition-colors">
                    {article.title}
                  </h2>
                  {article.description && (
                    <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                      {article.description}
                    </p>
                  )}
                  {article.tags.length > 0 && (
                    <p className="mt-3 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                      {article.tags.join(" · ")}
                    </p>
                  )}
                </div>
                <ArrowRight
                  className="mt-2 size-4 shrink-0 text-muted-foreground/60 transition-all group-hover:translate-x-0.5 group-hover:text-primary"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            No articles in this category yet.
          </p>
        </div>
      )}
    </div>
  )
}
