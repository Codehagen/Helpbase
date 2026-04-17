import { notFound } from "next/navigation"
import Link from "next/link"
import { getTenant, getTenantCategories, getTenantArticles } from "@/lib/tenant-content"
import { getTenantSearchIndex } from "@/lib/tenant-search"
import { DocsSidebar } from "@/components/docs-sidebar"
import { MobileSidebar } from "@/components/mobile-sidebar"
import { SearchDialog } from "@/components/search-dialog"
import { TenantSearchTrigger } from "@/components/tenant-search-trigger"
import type { Category } from "@workspace/shared/types"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenant: string }>
}) {
  const { tenant: slug } = await params
  const tenant = await getTenant(slug)
  if (!tenant) return {}

  return {
    title: {
      template: `%s | ${tenant.name || slug}`,
      default: `${tenant.name || slug} Help Center`,
    },
    metadataBase: new URL(`https://${slug}.helpbase.dev`),
  }
}

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ tenant: string }>
}) {
  const { tenant: slug } = await params
  const tenant = await getTenant(slug)

  if (!tenant) notFound()

  const [categories, articles, searchIndex] = await Promise.all([
    getTenantCategories(tenant.id),
    getTenantArticles(tenant.id),
    getTenantSearchIndex(tenant.id),
  ])

  // Build Category[] shape that DocsSidebar expects
  const sidebarCategories: Category[] = categories.map((cat) => ({
    slug: cat.slug,
    title: cat.title,
    description: cat.description,
    icon: cat.icon ?? "file-text",
    order: cat.order,
    articles: articles
      .filter((a) => a.category === cat.slug)
      .map((a) => ({
        schemaVersion: 1,
        slug: a.slug,
        category: a.category,
        title: a.title,
        description: a.description,
        order: a.order,
        tags: a.tags ?? [],
        featured: a.featured ?? false,
        filePath: a.file_path,
        rawContent: "",
      })),
  }))

  return (
    <div className="flex min-h-svh flex-col">
      {/* Tenant header */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4">
          <Link href="/" className="text-sm font-semibold shrink-0">
            {tenant.name || slug} Help Center
          </Link>
          <TenantSearchTrigger />
        </div>
      </header>

      {/* ⌘K search — fires from TenantSearchTrigger and from the shortcut */}
      <SearchDialog items={searchIndex} />

      {/* Content */}
      <main className="flex-1">
        <div className="mx-auto max-w-7xl">
          <div className="flex">
            {/* Desktop sidebar */}
            <aside className="hidden w-60 shrink-0 lg:block">
              <div className="sticky top-14 h-[calc(100svh-3.5rem)] overflow-y-auto border-r border-border/50 px-4 py-8">
                <DocsSidebar categories={sidebarCategories} />
              </div>
            </aside>

            {/* Mobile sidebar */}
            <div className="lg:hidden">
              <MobileSidebar categories={sidebarCategories} />
            </div>

            {/* Main content */}
            <div className="min-w-0 flex-1">{children}</div>
          </div>
        </div>
      </main>

      {/* Footer: AI-synthesized disclosure + powered-by */}
      <footer className="border-t border-border/50 py-6 text-center space-y-2">
        <p className="text-xs text-muted-foreground px-4">
          ⓘ This content is AI-synthesized from the underlying codebase.
          Verify before acting on it.
        </p>
        <a
          href={`https://helpbase.dev?ref=${slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Powered by Helpbase
        </a>
      </footer>
    </div>
  )
}
