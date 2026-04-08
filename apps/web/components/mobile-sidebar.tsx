"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import { useEffect } from "react"
import { DocsSidebar } from "@/components/docs-sidebar"
import type { Category } from "@workspace/shared/types"

interface MobileSidebarProps {
  categories: Category[]
}

export function MobileSidebar({ categories }: MobileSidebarProps) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Close on navigation
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <>
      {/* Floating trigger button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 left-6 z-40 flex size-12 items-center justify-center rounded-full bg-foreground text-background shadow-lg transition-transform duration-150 ease-out active:scale-[0.97] lg:hidden"
        aria-label="Open navigation"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5">
          <line x1="4" x2="20" y1="12" y2="12" />
          <line x1="4" x2="20" y1="6" y2="6" />
          <line x1="4" x2="20" y1="18" y2="18" />
        </svg>
      </button>

      {/* Overlay + Drawer */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm lg:hidden"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 w-72 bg-background shadow-xl lg:hidden">
            <div className="flex h-14 items-center justify-between border-b border-border/50 px-4">
              <span className="text-sm font-semibold">Navigation</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close navigation"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto px-4 py-6" style={{ height: "calc(100% - 3.5rem)" }}>
              <DocsSidebar categories={categories} />
            </div>
          </div>
        </>
      )}
    </>
  )
}
