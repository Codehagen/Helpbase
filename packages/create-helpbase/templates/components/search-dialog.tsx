"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import type { SearchItem } from "@/lib/search"

interface SearchDialogProps {
  items: SearchItem[]
}

export function SearchDialog({ items }: SearchDialogProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Cmd+K to open
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
      if (e.key === "Escape") {
        setOpen(false)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  // Focus input when opening
  useEffect(() => {
    if (open) {
      setQuery("")
      setSelectedIndex(0)
      // Small delay to let the dialog render
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // Filter results
  const results = useMemo(() => {
    if (!query.trim()) return items
    const terms = query.toLowerCase().split(/\s+/)
    return items.filter((item) => {
      const text = `${item.title} ${item.description} ${item.categoryTitle}`.toLowerCase()
      return terms.every((term) => text.includes(term))
    })
  }, [items, query])

  // Scroll selected item into view
  useEffect(() => {
    const container = listRef.current
    if (!container) return
    const selected = container.querySelector("[data-selected=true]")
    if (selected) {
      selected.scrollIntoView({ block: "nearest" })
    }
  }, [selectedIndex])

  const navigate = useCallback(
    (href: string) => {
      setOpen(false)
      router.push(href)
    },
    [router]
  )

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter" && results[selectedIndex]) {
      e.preventDefault()
      navigate(results[selectedIndex].href)
    }
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop — warm near-black, subtle */}
      <div
        role="presentation"
        className="fixed inset-0 z-50 bg-foreground/20 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search documentation"
        className="fixed inset-x-0 top-[18%] z-50 mx-auto w-full max-w-xl px-4"
      >
        <div className="animate-scale-fade-in overflow-hidden rounded-xl border border-border bg-background shadow-[0_20px_60px_-12px_rgba(28,25,23,0.25)]">
          {/* Search input */}
          <div className="flex items-center gap-3 border-b border-border px-4">
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search articles, guides, commands…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setSelectedIndex(0)
              }}
              onKeyDown={onKeyDown}
              className="h-14 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="hidden h-5 items-center rounded border border-border bg-surface px-1.5 font-mono text-[10px] text-muted-foreground sm:flex">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-80 overflow-y-auto p-1.5">
            {results.length === 0 ? (
              <div className="px-3 py-10 text-center text-sm text-muted-foreground">
                No results for{" "}
                <span className="italic text-foreground">
                  &ldquo;{query}&rdquo;
                </span>
              </div>
            ) : (
              results.map((item, index) => (
                <button
                  key={item.href}
                  type="button"
                  data-selected={index === selectedIndex}
                  onClick={() => navigate(item.href)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className="group flex w-full items-start gap-3 rounded-md border-l-2 border-transparent px-3 py-2.5 text-left transition-colors data-[selected=true]:border-primary data-[selected=true]:bg-surface"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground group-data-[selected=true]:text-primary">
                      {item.title}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                      <span>{item.categoryTitle}</span>
                    </div>
                  </div>
                  <ReturnIcon className="mt-1 size-3.5 shrink-0 text-primary opacity-0 group-data-[selected=true]:opacity-100" />
                </button>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="inline-flex size-4 items-center justify-center rounded border border-border bg-muted font-mono text-[10px]">↑</kbd>
                <kbd className="inline-flex size-4 items-center justify-center rounded border border-border bg-muted font-mono text-[10px]">↓</kbd>
                navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="inline-flex h-4 items-center justify-center rounded border border-border bg-muted px-1 font-mono text-[10px]">↵</kbd>
                open
              </span>
            </div>
            <span>{results.length} result{results.length !== 1 ? "s" : ""}</span>
          </div>
        </div>
      </div>
    </>
  )
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

function ReturnIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="9 10 4 15 9 20" />
      <path d="M20 4v7a4 4 0 0 1-4 4H4" />
    </svg>
  )
}
