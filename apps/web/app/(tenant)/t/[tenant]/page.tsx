import Link from "next/link"
import { notFound } from "next/navigation"
import {
  getTenant,
  getTenantCategories,
  getFeaturedTenantArticles,
} from "@/lib/tenant-content"
import { titleCase } from "@workspace/shared/slugify"

export const revalidate = 3600

export default async function TenantHomePage({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: slug } = await params
  const tenant = await getTenant(slug)
  if (!tenant) notFound()

  const [categories, featured] = await Promise.all([
    getTenantCategories(tenant.id),
    getFeaturedTenantArticles(tenant.id),
  ])

  return (
    <div className="px-8 py-10 lg:px-12">
      <div className="mb-12">
        <h1 className="text-3xl font-bold tracking-tight">
          {tenant.name || titleCase(slug)} Help Center
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Find answers, guides, and resources.
        </p>
      </div>

      {/* Featured articles */}
      {featured.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Popular articles
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {featured.map((article) => (
              <Link
                key={article.id}
                href={`/${article.category}/${article.slug}`}
                className="group rounded-xl border border-border p-4 transition-[border-color,background-color] duration-150 ease-out hover:border-foreground/15 hover:bg-muted/30"
              >
                <h3 className="text-sm font-medium group-hover:text-foreground">
                  {article.title}
                </h3>
                {article.description && (
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                    {article.description}
                  </p>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Category grid */}
      <section>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Browse by category
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <Link
              key={category.slug}
              href={`/${category.slug}`}
              className="group rounded-xl border border-border p-5 transition-[border-color,background-color] duration-150 ease-out hover:border-foreground/15 hover:bg-muted/30"
            >
              <h3 className="font-medium group-hover:text-foreground">
                {category.title}
              </h3>
              {category.description && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {category.description}
                </p>
              )}
              <span className="mt-3 block text-xs text-muted-foreground">
                {category.articleCount} {category.articleCount === 1 ? "article" : "articles"}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
