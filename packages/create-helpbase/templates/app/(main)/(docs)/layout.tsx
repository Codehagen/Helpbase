import { getCategories } from "@/lib/content"
import { DocsSidebar } from "@/components/docs-sidebar"
import { MobileSidebar } from "@/components/mobile-sidebar"

export default async function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const categories = await getCategories()

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-14 h-[calc(100svh-3.5rem)] overflow-y-auto border-r border-border/50 px-4 py-8">
            <DocsSidebar categories={categories} />
          </div>
        </aside>

        {/* Mobile sidebar trigger (rendered in the page area) */}
        <div className="lg:hidden">
          <MobileSidebar categories={categories} />
        </div>

        {/* Main content */}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  )
}
