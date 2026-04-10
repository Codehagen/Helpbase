"use client"

import { useState, useEffect } from "react"
import { resolveAssetPath } from "@/lib/assets"

export function Video({
  src,
  embed,
  loop = true,
  autoplay = true,
  muted = true,
  caption,
  poster,
  category,
  slug,
}: {
  src?: string
  embed?: string
  loop?: boolean
  autoplay?: boolean
  muted?: boolean
  caption?: string
  poster?: string
  category?: string
  slug?: string
}) {
  if (src && embed) {
    throw new Error(
      "Video: provide either 'src' or 'embed', not both. " +
        "Use 'src' for local video files, 'embed' for YouTube/Loom/Vimeo URLs.",
    )
  }
  if (!src && !embed) {
    throw new Error(
      "Video: provide either 'src' (local video file) or 'embed' (YouTube/Loom/Vimeo URL).",
    )
  }

  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    setPrefersReducedMotion(mq.matches)
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])

  const resolvedSrc =
    src && category && slug && !src.startsWith("http") && !src.startsWith("/")
      ? resolveAssetPath(category, slug, src)
      : src

  const resolvedPoster =
    poster && category && slug && !poster.startsWith("http") && !poster.startsWith("/")
      ? resolveAssetPath(category, slug, poster)
      : poster

  return (
    <figure className="my-6">
      {src ? (
        <video
          src={resolvedSrc}
          poster={resolvedPoster}
          loop={loop && !prefersReducedMotion}
          autoPlay={autoplay && !prefersReducedMotion}
          muted={muted}
          playsInline
          controls={prefersReducedMotion}
          className="w-full rounded-xl border border-border"
        />
      ) : (
        <div className="relative aspect-video overflow-hidden rounded-xl border border-border">
          <iframe
            src={embed}
            title="Embedded video"
            sandbox="allow-scripts allow-same-origin"
            referrerPolicy="no-referrer"
            allow="fullscreen"
            className="size-full"
          />
        </div>
      )}
      {caption && (
        <figcaption className="mt-2 text-center text-sm text-muted-foreground">
          {caption}
        </figcaption>
      )}
    </figure>
  )
}
