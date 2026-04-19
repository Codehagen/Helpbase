import path from "node:path"

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Explicitly pin the workspace root so Turbopack doesn't try to infer it
  // from apps/web and panic. Resolves to the monorepo root (../..).
  turbopack: {
    root: path.resolve(import.meta.dirname, "../.."),
  },
  transpilePackages: ["@workspace/ui"],
  images: {
    // Marketing landing uses a remote backdrop image. Keep the allowlist
    // tight — only images.unsplash.com, nothing wildcard.
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
}

export default nextConfig
