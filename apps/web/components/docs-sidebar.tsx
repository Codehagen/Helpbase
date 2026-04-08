"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@workspace/ui/lib/utils"
import type { Category } from "@workspace/shared/types"

interface DocsSidebarProps {
  categories: Category[]
}

export function DocsSidebar({ categories }: DocsSidebarProps) {
  const pathname = usePathname()

  return (
    <nav className="space-y-1">
      {categories.map((category, index) => (
        <SidebarSection
          key={category.slug}
          category={category}
          pathname={pathname}
          isLast={index === categories.length - 1}
        />
      ))}
    </nav>
  )
}

function SidebarSection({
  category,
  pathname,
  isLast,
}: {
  category: Category
  pathname: string
  isLast: boolean
}) {
  const isCategoryActive = pathname.startsWith(`/${category.slug}`)
  const [isOpen, setIsOpen] = useState<boolean>(true)

  return (
    <div className={cn(!isLast && "pb-4")}>
      {/* Category header with toggle */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          "group flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm font-medium transition-colors duration-150 ease-out hover:bg-muted/60",
          isCategoryActive ? "text-foreground" : "text-muted-foreground"
        )}
      >
        <span className="flex items-center gap-2">
          <CategoryIcon slug={category.slug} />
          {category.title}
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn(
            "size-3.5 text-muted-foreground/50 transition-transform duration-200",
            isOpen && "rotate-90"
          )}
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>

      {/* Article list */}
      {isOpen && category.articles.length > 0 && (
        <ul className="mt-1 space-y-0.5 pl-2">
          {category.articles.map((article) => {
            const articlePath = `/${category.slug}/${article.slug}`
            const isActive = pathname === articlePath

            return (
              <li key={article.slug}>
                <Link
                  href={articlePath}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors duration-150 ease-out",
                    isActive
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  )}
                >
                  {isActive && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-foreground" />
                  )}
                  <span className={cn(!isActive && "pl-[14px]")}>
                    {article.title}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {/* Section separator */}
      {!isLast && (
        <div className="mt-4 border-b border-border/50" />
      )}
    </div>
  )
}

function CategoryIcon({ slug }: { slug: string }) {
  const iconClass = "size-4 shrink-0"

  switch (slug) {
    case "getting-started":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={iconClass}>
          <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
        </svg>
      )
    case "customization":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={iconClass}>
          <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" />
          <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
          <path d="M12 2v2" /><path d="M12 22v-2" />
          <path d="m17 20.66-1-1.73" /><path d="M11 10.27 7 3.34" />
          <path d="m20.66 17-1.73-1" /><path d="m3.34 7 1.73 1" />
          <path d="M14 12h8" /><path d="M2 12h2" />
          <path d="m20.66 7-1.73 1" /><path d="m3.34 17 1.73-1" />
          <path d="m17 3.34-1 1.73" /><path d="m11 13.73-4 6.93" />
        </svg>
      )
    default:
      return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={iconClass}>
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
        </svg>
      )
  }
}
