import Link from "next/link"
import { ChevronRight, FileText } from "lucide-react"
import * as LucideIcons from "lucide-react"

function getIcon(name: string) {
  const pascalName = name
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const icons = LucideIcons as Record<string, any>
  const Icon = icons[pascalName]
  if (Icon && typeof Icon === "function") return Icon as React.ComponentType<{ className?: string }>
  return FileText
}

export function CardGroup({
  cols = 2,
  children,
}: {
  cols?: 2 | 3
  children: React.ReactNode
}) {
  return (
    <div
      className={`my-6 grid gap-4 ${
        cols === 3
          ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
          : "grid-cols-1 sm:grid-cols-2"
      }`}
    >
      {children}
    </div>
  )
}

export function Card({
  icon,
  title,
  href,
  children,
}: {
  icon?: string
  title: string
  href: string
  children?: React.ReactNode
}) {
  const Icon = icon ? getIcon(icon) : FileText

  return (
    <Link
      href={href}
      className="group relative flex flex-col gap-2 rounded-xl border border-border p-4 transition-[border-color,background-color] duration-200 hover:border-foreground/15 hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      <Icon className="size-5 text-muted-foreground" />
      <span className="text-sm font-semibold">{title}</span>
      {children && (
        <span className="line-clamp-2 text-sm text-muted-foreground">
          {children}
        </span>
      )}
      <ChevronRight className="absolute right-4 top-4 size-4 text-muted-foreground opacity-0 transition-all duration-200 group-hover:translate-x-1 group-hover:opacity-100" />
    </Link>
  )
}
