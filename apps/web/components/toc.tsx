"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { cn } from "@workspace/ui/lib/utils"
import type { TocItem } from "@workspace/shared/types"

interface TableOfContentsProps {
  items: TocItem[]
}

export function TableOfContents({ items }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>("")
  const indicatorRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLElement>(null)

  // Determine which heading is active based on scroll position.
  // Uses a "last heading above the fold" approach instead of
  // IntersectionObserver, which fixes both problems:
  //   1. Works on initial load (no scroll event needed)
  //   2. Works at page bottom (last heading wins when no heading is below)
  const updateActiveHeading = useCallback(() => {
    const headings = items
      .map((item) => ({
        id: item.id,
        el: document.getElementById(item.id),
      }))
      .filter((h) => h.el != null) as { id: string; el: HTMLElement }[]

    if (headings.length === 0) return

    // If scrolled to the bottom, activate the last heading
    const atBottom =
      window.innerHeight + window.scrollY >=
      document.documentElement.scrollHeight - 50

    if (atBottom) {
      setActiveId(headings[headings.length - 1]!.id)
      return
    }

    // Otherwise find the last heading that has scrolled past the top threshold
    const scrollY = window.scrollY + 100
    let active = headings[0]!.id

    for (const heading of headings) {
      if (heading.el.offsetTop <= scrollY) {
        active = heading.id
      } else {
        break
      }
    }

    setActiveId(active)
  }, [items])

  useEffect(() => {
    // Set initial active heading on mount
    updateActiveHeading()

    window.addEventListener("scroll", updateActiveHeading, { passive: true })
    return () => window.removeEventListener("scroll", updateActiveHeading)
  }, [updateActiveHeading])

  // Move the indicator bar using transform (GPU-accelerated)
  useEffect(() => {
    if (!activeId || !navRef.current || !indicatorRef.current) return

    const activeLink = navRef.current.querySelector(
      `[data-toc-id="${activeId}"]`
    ) as HTMLElement | null

    if (activeLink) {
      const navRect = navRef.current.getBoundingClientRect()
      const linkRect = activeLink.getBoundingClientRect()
      const y = linkRect.top - navRect.top
      indicatorRef.current.style.transform = `translateY(${y}px)`
      indicatorRef.current.style.height = `${linkRect.height}px`
      indicatorRef.current.style.opacity = "1"
    }
  }, [activeId])

  return (
    <nav ref={navRef} className="relative">
      {/* Track line */}
      <div className="absolute left-0 top-0 h-full w-px bg-border" />

      {/* Active indicator — slides along the track */}
      <div
        ref={indicatorRef}
        className="toc-indicator absolute left-0 top-0 w-px bg-foreground opacity-0"
      />

      {/* Links */}
      <div className="space-y-0.5">
        {items.map((item) => {
          const isActive = item.id === activeId
          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              data-toc-id={item.id}
              className={cn(
                "block border-l border-transparent py-1 pl-3 text-[13px] leading-snug transition-colors duration-150",
                isActive
                  ? "font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
                item.depth === 3 && "pl-6"
              )}
            >
              {item.text}
            </a>
          )
        })}
      </div>
    </nav>
  )
}
