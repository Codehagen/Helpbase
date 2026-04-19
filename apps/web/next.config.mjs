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
  // 301 stale `/landing` URLs back to `/` on apex/non-tenant hosts only.
  // The marketing page lived at `/landing` for one preview cycle before
  // being promoted to root; external refs (Vercel preview links, DMs,
  // social) keep working after the move.
  //
  // CRITICAL: scoped to specific apex/preview hosts via per-entry `has`
  // matchers so a tenant subdomain (`{slug}.helpbase.dev`) that ships
  // an article at `/landing` is NOT silently redirected to its root
  // before `proxy.ts` middleware gets to rewrite it. We use one redirect
  // entry per host pattern instead of a single regex with alternation —
  // path-to-regexp's `value` matching gets ambiguous with grouped
  // alternations and `localhost:3000` failed to match in practice.
  //
  // Mirror the host classification proxy.ts uses:
  //   - apex / www on the prod domain
  //   - shared Vercel previews (`helpbase-*.vercel.app`, NOT
  //     `{tenant}---*.vercel.app` which is a tenant preview)
  //
  // Localhost is intentionally NOT covered: path-to-regexp treats the
  // colon in `localhost:3000` as a parameter delimiter, so matching
  // ports cleanly is fragile. Devs hitting /landing locally get a 404,
  // which is acceptable since /landing URLs are only ever shared from
  // production or Vercel preview deploys.
  //
  // See proxy.ts:extractSubdomainFromHost for the canonical logic.
  async redirects() {
    const target = { source: "/landing", destination: "/", permanent: true }
    return [
      { ...target, has: [{ type: "host", value: "helpbase.dev" }] },
      { ...target, has: [{ type: "host", value: "www.helpbase.dev" }] },
      {
        ...target,
        has: [
          {
            type: "host",
            // Vercel shared preview pattern: helpbase-{branch-and-author}.vercel.app
            // The `[a-z0-9-]+` excludes dots (so the named group can't bridge
            // a subdomain boundary) and the `---` (which marks tenant previews).
            value: "helpbase-(?<preview>[a-z0-9-]+)\\.vercel\\.app",
          },
        ],
      },
    ]
  },
}

export default nextConfig
