"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { resolveAssetPath } from "@/lib/assets"

export function CtaCard({
  src,
  title,
  href,
  description,
  category,
  slug,
}: {
  src: string
  title: string
  href: string
  description?: string
  category?: string
  slug?: string
}) {
  const [imgError, setImgError] = useState(false)
  const resolvedSrc =
    category && slug && src && !src.startsWith("http") && !src.startsWith("/")
      ? resolveAssetPath(category, slug, src)
      : src

  return (
    <Link
      href={href}
      className="group relative my-6 block overflow-hidden rounded-xl border border-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      {imgError ? (
        <div className="flex aspect-video items-center justify-center bg-muted text-sm text-muted-foreground">
          Preview unavailable
        </div>
      ) : (
        <img
          src={resolvedSrc}
          alt={title}
          loading="lazy"
          onError={() => setImgError(true)}
          className="aspect-video w-full object-cover"
        />
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
        <span className="text-sm font-semibold text-white">{title}</span>
        {description && (
          <span className="mt-1 text-xs text-white/80">{description}</span>
        )}
        <ArrowUpRight className="mt-2 size-4 text-white" />
      </div>
    </Link>
  )
}
