import Link from "next/link"
import {
  ArrowRight,
  BookOpen,
  FileCode,
  FileText,
  HelpCircle,
  MessageSquare,
  Paintbrush,
  Rocket,
  Terminal,
} from "lucide-react"

import { getCategories, getFeaturedArticles } from "@/lib/content"
import { SearchTriggerHero } from "@/components/search-trigger"

const CATEGORY_ICONS: Record<string, typeof Rocket> = {
  "getting-started": Rocket,
  cli: Terminal,
  customization: Paintbrush,
  guides: BookOpen,
  reference: FileCode,
}

function getCategoryIcon(slug: string) {
  const Icon = CATEGORY_ICONS[slug] ?? FileText
  return <Icon className="size-4 text-muted-foreground" strokeWidth={1.5} />
}

export default async function HomePage() {
  const categories = await getCategories()
  const featured = await getFeaturedArticles()

  return (
    <div>
      {/* Hero — centered, editorial serif */}
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-3xl px-6 pb-20 pt-24 text-center">
          <div className="mx-auto mb-6 inline-flex size-9 items-center justify-center rounded-full border border-border/80 bg-background">
            <HelpCircle
              className="size-4 text-muted-foreground"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </div>
          <h1 className="animate-fade-in font-serif text-5xl leading-[1.05] tracking-tight text-foreground sm:text-6xl">
            How can we{" "}
            <span className="italic text-primary">help today?</span>
          </h1>
          <p className="animate-fade-in-delay-1 mx-auto mt-5 max-w-md text-base text-muted-foreground sm:text-lg">
            Search guides, CLI reference, and AI-generated documentation for
            helpbase.
          </p>

          <div className="animate-fade-in-delay-2 mx-auto mt-10 max-w-xl">
            <SearchTriggerHero />
          </div>
        </div>
      </section>

      {/* Popular articles — full-width typographic list */}
      {featured.length > 0 && (
        <section className="border-b border-border/60">
          <div className="mx-auto max-w-4xl px-6 py-20">
            <p className="mb-6 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
              Popular articles
            </p>
            <ul className="grid grid-cols-1 divide-y divide-border/80 sm:grid-cols-2 sm:gap-x-10 sm:divide-y-0 sm:[&>li]:border-b sm:[&>li]:border-border/80">
              {featured.slice(0, 6).map((article) => (
                <li key={`${article.category}/${article.slug}`}>
                  <Link
                    href={`/${article.category}/${article.slug}`}
                    className="group flex items-center justify-between gap-3 py-4 text-sm transition-colors hover:text-primary"
                  >
                    <span className="font-medium leading-snug">
                      {article.title}
                    </span>
                    <ArrowRight
                      className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Browse by category — full-width card grid */}
      <section className="border-b border-border/60">
        <div className="mx-auto max-w-4xl px-6 py-20">
          <p className="mb-6 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
            Browse by category
          </p>
          {categories.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((category) => (
                <Link
                  key={category.slug}
                  href={`/${category.slug}`}
                  className="group flex flex-col gap-2 rounded-lg border border-border bg-surface p-5 transition-[border-color] duration-150 ease-out hover:border-border-strong"
                >
                  <div className="flex items-center gap-2">
                    {getCategoryIcon(category.slug)}
                    <h3 className="text-sm font-semibold tracking-tight text-foreground">
                      {category.title}
                    </h3>
                  </div>
                  {category.description && (
                    <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                      {category.description}
                    </p>
                  )}
                  <div className="mt-auto pt-3 font-mono text-xs text-muted-foreground">
                    {category.articles.length} article
                    {category.articles.length !== 1 ? "s" : ""}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <p className="text-sm text-muted-foreground">
                No categories yet. Run{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                  helpbase generate
                </code>{" "}
                to create your first article.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Still need help? */}
      <section>
        <div className="mx-auto max-w-4xl px-6 py-20">
          <div className="flex flex-col items-start gap-5 rounded-xl border border-border bg-surface p-8 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <MessageSquare
                className="mt-0.5 size-5 text-muted-foreground"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <div>
                <h2 className="font-serif text-xl text-foreground">
                  Still need help?
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Open an issue on GitHub and the maintainers will take a look.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <a
                href="https://github.com/Codehagen/helpbase/issues/new"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Open an issue
              </a>
              <a
                href="https://github.com/Codehagen/helpbase"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center rounded-md border border-border-strong bg-transparent px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                View on GitHub
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
