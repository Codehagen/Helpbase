"use client"

import { useState, useRef, useCallback, Children, isValidElement } from "react"

export function Tabs({ children }: { children: React.ReactNode }) {
  const tabs = Children.toArray(children).filter(
    (child): child is React.ReactElement<{ label: string; children?: React.ReactNode }> =>
      isValidElement(child) && (child as React.ReactElement).type === Tab,
  )
  const [active, setActive] = useState(0)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      let next = active
      if (e.key === "ArrowRight") next = (active + 1) % tabs.length
      else if (e.key === "ArrowLeft") next = (active - 1 + tabs.length) % tabs.length
      else if (e.key === "Home") next = 0
      else if (e.key === "End") next = tabs.length - 1
      else return
      e.preventDefault()
      setActive(next)
      tabRefs.current[next]?.focus()
    },
    [active, tabs.length],
  )

  return (
    <div className="my-6">
      {/* Tab list with horizontal scroll on narrow viewports */}
      <div
        role="tablist"
        className="flex overflow-x-auto border-b border-border [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onKeyDown={handleKeyDown}
      >
        {tabs.map((child, i) => {
          if (!isValidElement(child)) return null
          return (
            <button
              key={i}
              ref={(el) => { tabRefs.current[i] = el }}
              role="tab"
              aria-selected={i === active}
              tabIndex={i === active ? 0 : -1}
              onClick={() => setActive(i)}
              className={`shrink-0 border-b-2 px-4 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none ${
                i === active
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground/80"
              }`}
            >
              {child.props.label}
            </button>
          )
        })}
      </div>
      {/* Tab panels */}
      {tabs.map((child, i) => {
        if (!isValidElement(child)) return null
        return (
          <div
            key={i}
            role="tabpanel"
            hidden={i !== active}
            className="pt-4 text-sm [&>p:last-child]:mb-0"
          >
            {child.props.children}
          </div>
        )
      })}
    </div>
  )
}

export function Tab({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return null
}

Tab.displayName = "Tab"
