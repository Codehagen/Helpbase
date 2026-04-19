import Link from "next/link"
import { notFound } from "next/navigation"
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

  return (
    <div className="max-w-5xl px-8 py-10 lg:px-12">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/" className="transition-colors hover:text-foreground">
          Docs
        </Link>
        <ChevronIcon />
        <span className="text-foreground">{category.title}</span>
      </nav>

      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight">
          {category.title}
        </h1>
        {category.description && (
          <p className="mt-2 text-lg text-muted-foreground">
            {category.description}
          </p>
        )}
      </div>

      {/* Articles */}
      {category.articles.length > 0 ? (
        <div className="grid gap-2">
          {category.articles.map((article) => (
            <Link
              key={article.slug}
              href={`/${categorySlug}/${article.slug}`}
              className="group flex items-center gap-4 rounded-xl border border-transparent px-4 py-4 transition-[border-color,background-color] duration-150 ease-out hover:border-border hover:bg-muted/30"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted transition-colors group-hover:bg-foreground group-hover:text-background">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                  <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                  <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-medium leading-snug">{article.title}</h2>
                <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                  {article.description}
                </p>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center text-muted-foreground">
          <p>No articles in this category yet.</p>
        </div>
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
