import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/types/supabase"

// Kept in sync with RESERVED_SLUGS in packages/cli/src/commands/deploy.ts
// and packages/cli/src/commands/link.ts. Any change here must happen in
// all three places (drift guard is a v1.5 CI check).
const RESERVED_SLUGS = new Set([
  "www",
  "app",
  "api",
  "admin",
  "dashboard",
  "docs",
  "help",
  "blog",
  "status",
  "mail",
  "mcp",
  "deploy",
  "login",
  "signup",
  "signin",
  "auth",
  "billing",
  "support",
  "cdn",
  "static",
  "assets",
  "files",
  "media",
  "images",
  "img",
])

// .trim() guards against copy-paste of env values that carry a trailing
// newline (we've been bitten by this once already on 2026-04-16 — a stray
// '\n' in NEXT_PUBLIC_ROOT_DOMAIN broke subdomain matching in production).
const ROOT_DOMAIN = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "helpbase.dev").trim()

/**
 * Pure-string subdomain extractor — consumes a raw Host header (with or
 * without a port) and returns the tenant slug, or null if the request
 * targets the apex, www, or an unknown domain. Exported for unit tests.
 *
 * The NextRequest variant below wraps this for use in the Proxy runtime.
 *
 * Resolution order:
 *   1. IPs and IPv6 → null (never tenant-routed)
 *   2. *.localhost[:port] → first label (dev)
 *   3. *---*.vercel.app → first chunk before --- (Vercel preview tenants)
 *   4. *.vercel.app (no ---) → null (shared preview, not tenant-routed)
 *   5. *.<ROOT_DOMAIN> → subdomain, unless www / apex
 *   6. Anything else → null (don't guess on unknown apex domains)
 */
function extractSubdomainFromHost(rawHost: string | null | undefined): string | null {
  if (!rawHost) return null
  const host = rawHost.split(":")[0]!.toLowerCase()

  // IP addresses never host tenants.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return null
  if (host.includes("::")) return null

  // Local dev: tenant.localhost[:port]
  if (host === "localhost" || host.endsWith(".localhost")) {
    if (host === "localhost") return null
    const first = host.split(".")[0]!
    return first.length > 0 ? first : null
  }

  // Vercel preview tenant: tenant---branch.vercel.app
  if (host.includes("---") && host.endsWith(".vercel.app")) {
    const parts = host.split("---")
    return parts.length > 0 && parts[0]!.length > 0 ? parts[0]! : null
  }

  // Other vercel.app (bare preview hostname, no tenant routing).
  if (host.endsWith(".vercel.app")) return null

  // Production: *.{ROOT_DOMAIN}
  const rootDomain = ROOT_DOMAIN.split(":")[0]!.toLowerCase()
  if (host === rootDomain || host === `www.${rootDomain}`) return null
  if (host.endsWith(`.${rootDomain}`)) {
    return host.slice(0, host.length - rootDomain.length - 1)
  }

  return null
}

function extractSubdomain(request: NextRequest): string | null {
  return extractSubdomainFromHost(request.headers.get("host"))
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Block direct access to /t/* on root domain (internal route leak)
  const subdomain = extractSubdomain(request)
  if (!subdomain && pathname.startsWith("/t/")) {
    return NextResponse.redirect(new URL("/", request.url))
  }

  // No subdomain = self-hosted / root domain, pass through
  if (!subdomain) {
    return NextResponse.next()
  }

  // Reserved slugs redirect to root
  if (RESERVED_SLUGS.has(subdomain)) {
    return NextResponse.redirect(
      new URL("/", `${request.nextUrl.protocol}//${ROOT_DOMAIN}`)
    )
  }

  // Look up tenant in Supabase
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    // Supabase not configured, pass through (self-hosted mode)
    return NextResponse.next()
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseKey)

  // Read from the public-safe view (tenants_public hides mcp_public_token
  // and owner_id from anon). Base tenants table has no anon read grant
  // post-2026-04-17 migration. `deployed_at` is the reservation flag —
  // null means "auto-provisioned placeholder, never published."
  const { data: tenant } = await supabase
    .from("tenants_public")
    .select("slug, deployed_at")
    .eq("slug", subdomain)
    .maybeSingle()

  if (!tenant) {
    // Unknown subdomain: show a "Create your help center" page
    const url = request.nextUrl.clone()
    url.pathname = "/t/_not-found"
    return NextResponse.rewrite(url)
  }

  // Reserved tenant: auto-provisioned placeholder without published
  // content. Routing rules:
  //   - `/`              → branded "coming soon" landing
  //     (/t/_reserved/<slug>)
  //   - `/mcp` + `/mcp/*` → fall through to the tenant route so the MCP
  //     handler's own 403 `tenant_not_deployed` response fires. If
  //     middleware short-circuits /mcp to _not-found, MCP clients polling
  //     a reservation URL during the first-deploy window get a 404 HTML
  //     page instead of the structured 403 JSON they expect (their retry
  //     logic then misclassifies "reserved, come back later" as "this
  //     tenant doesn't exist"). Caught by /review codex on 2026-04-18.
  //   - everything else  → rewrite to _not-found (which calls notFound()
  //     and returns HTTP 404)
  // Every reserved-tenant response carries X-Robots-Tag: noindex,nofollow.
  if (tenant.deployed_at === null) {
    if (pathname === "/mcp" || pathname.startsWith("/mcp/")) {
      const url = request.nextUrl.clone()
      url.pathname = `/t/${subdomain}${pathname}`
      const res = NextResponse.rewrite(url)
      res.headers.set("X-Robots-Tag", "noindex, nofollow")
      return res
    }
    const url = request.nextUrl.clone()
    if (pathname === "/" || pathname === "") {
      url.pathname = `/t/_reserved/${subdomain}`
    } else {
      url.pathname = "/t/_not-found"
    }
    const res = NextResponse.rewrite(url)
    res.headers.set("X-Robots-Tag", "noindex, nofollow")
    return res
  }

  // Rewrite to tenant route: company.helpbase.dev/path → /t/company/path
  const url = request.nextUrl.clone()
  url.pathname = `/t/${subdomain}${pathname}`
  return NextResponse.rewrite(url)
}

export const config = {
  matcher: [
    // Match all paths except Next.js internals, static files, and API routes
    "/((?!_next|api|favicon\\.ico|[\\w-]+\\.\\w+).*)",
  ],
}

export { extractSubdomain, extractSubdomainFromHost, RESERVED_SLUGS }
