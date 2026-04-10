"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"

export function Accordion({
  children,
  defaultOpen,
}: {
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  return <div className="my-6 divide-y divide-border rounded-xl border border-border">{children}</div>
}

export function AccordionItem({
  title,
  children,
  defaultOpen = false,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            setOpen(!open)
          }
        }}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        {title}
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 text-sm text-muted-foreground [&>p:last-child]:mb-0">
          {children}
        </div>
      )}
    </div>
  )
}
