"use client"

import { useState } from "react"
import { resolveAssetPath } from "@/lib/assets"

export function Figure({
  src,
  alt = "",
  caption,
  category,
  slug,
}: {
  src: string
  alt?: string
  caption?: string
  category?: string
  slug?: string
}) {
  const [error, setError] = useState(false)
  const resolvedSrc =
    category && slug && src && !src.startsWith("http") && !src.startsWith("/")
      ? resolveAssetPath(category, slug, src)
      : src

  return (
    <figure className="my-6">
      {error ? (
        <div className="flex aspect-video items-center justify-center rounded-xl border border-border bg-muted text-sm text-muted-foreground">
          Image not found
        </div>
      ) : (
        <img
          src={resolvedSrc}
          alt={alt}
          loading="lazy"
          onError={() => setError(true)}
          className="w-full rounded-xl border border-border"
        />
      )}
      {caption && (
        <figcaption className="mt-2 text-center text-sm text-muted-foreground">
          {caption}
        </figcaption>
      )}
    </figure>
  )
}
