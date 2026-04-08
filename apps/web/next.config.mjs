import path from "node:path"

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Explicitly pin the workspace root so Turbopack doesn't try to infer it
  // from apps/web and panic. Resolves to the monorepo root (../..).
  turbopack: {
    root: path.resolve(import.meta.dirname, "../.."),
  },
  transpilePackages: ["@workspace/ui"],
}

export default nextConfig
