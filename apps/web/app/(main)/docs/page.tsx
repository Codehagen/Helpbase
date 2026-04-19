import Link from "next/link"
import { getCategories, getFeaturedArticles } from "@/lib/content"
import { SearchTriggerHero } from "@/components/search-trigger"

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  "getting-started": (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-5">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  ),
  billing: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-5">
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <line x1="2" x2="22" y1="10" y2="10" />
    </svg>
  ),
  integrations: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-5">
      <path d="M12 22v-5" /><path d="M9 8V2" /><path d="M15 8V2" />
      <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
    </svg>
  ),
  api: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-5">
      <path d="m7 8-4 4 4 4" /><path d="m17 8 4 4-4 4" /><path d="m14 4-4 16" />
    </svg>
  ),
  troubleshooting: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-5">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z" />
    </svg>
  ),
  reference: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-5">
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
    </svg>
  ),
  cli: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-5">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" x2="20" y1="19" y2="19" />
    </svg>
  ),
  guides: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-5">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  ),
}

function getCategoryIcon(slug: string) {
  return (
    CATEGORY_ICONS[slug] ?? (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-5">
        <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
      </svg>
    )
  )
}

export default async function HomePage() {
  const categories = await getCategories()
  const featured = await getFeaturedArticles()

  return (
    <div>
      {/* Hero */}
      <div className="relative overflow-hidden border-b border-border/50">
        {/* Grid pattern background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-b from-muted/60 via-background/80 to-background" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,var(--muted),transparent)]" />
        <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-24 text-center">
          <h1 className="animate-fade-in mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            The docs your AI tools can read.
          </h1>
          <p className="animate-fade-in-delay-1 mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Helpbase includes an MCP server, an <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-base">llms.txt</code>, and a doc-sync tool that reads your source code. Open source, self-hostable, built on shadcn/ui + Next.js.
          </p>

          {/* Search bar in hero */}
          <div className="animate-fade-in-delay-2 mx-auto mt-8 max-w-md">
            <SearchTriggerHero />
          </div>
        </div>
      </div>

      {/* Categories */}
      <div className="mx-auto max-w-6xl px-6 py-16">
        {categories.length > 0 ? (
          <>
            <div className="mb-8">
              <h2 className="text-lg font-semibold tracking-tight">
                Browse by category
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Explore our guides and documentation
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((category) => (
                <Link
                  key={category.slug}
                  href={`/${category.slug}`}
                  className="group relative rounded-xl border border-border bg-card p-6 transition-[border-color,box-shadow] duration-150 ease-out hover:border-foreground/15 hover:shadow-md"
                >
                  <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-muted text-foreground transition-colors group-hover:bg-foreground group-hover:text-background">
                    {getCategoryIcon(category.slug)}
                  </div>
                  <h3 className="font-semibold tracking-tight">
                    {category.title}
                  </h3>
                  {category.description && (
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {category.description}
                    </p>
                  )}
                  <div className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span>
                      {category.articles.length} article
                      {category.articles.length !== 1 ? "s" : ""}
                    </span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-3 transition-transform group-hover:translate-x-0.5"
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center text-muted-foreground">
            <p className="text-lg font-medium">No articles yet</p>
            <p className="mt-2 text-sm">
              Run{" "}
              <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                helpbase generate
              </code>{" "}
              to create your first article.
            </p>
          </div>
        )}

        {/* Featured articles */}
        {featured.length > 0 && (
          <div className="mt-20">
            <div className="mb-8">
              <h2 className="text-lg font-semibold tracking-tight">
                Popular articles
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Frequently visited guides and resources
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((article) => (
                <Link
                  key={`${article.category}/${article.slug}`}
                  href={`/${article.category}/${article.slug}`}
                  className="group flex items-start gap-3 rounded-xl border border-border p-4 transition-[border-color,background-color] duration-150 ease-out hover:border-foreground/15 hover:bg-muted/30"
                >
                  <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-muted">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-3.5 text-muted-foreground"
                    >
                      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-medium leading-snug group-hover:text-foreground">
                      {article.title}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {article.description}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
