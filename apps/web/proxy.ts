import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/types/supabase"

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
])

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "helpbase.dev"

function extractSubdomain(request: NextRequest): string | null {
  const host = request.headers.get("host") ?? ""
  const hostname = host.split(":")[0]!

  // Local development: tenant.localhost
  if (hostname.includes("localhost") || hostname.includes("127.0.0.1")) {
    const match = hostname.match(/^([^.]+)\.localhost/)
    if (match?.[1] && match[1] !== "localhost") {
      return match[1]
    }
    return null
  }

  // Vercel preview: tenant---branch.vercel.app
  if (hostname.includes("---") && hostname.endsWith(".vercel.app")) {
    const parts = hostname.split("---")
    return parts.length > 0 ? parts[0]! : null
  }

  // Production: tenant.helpbase.dev
  const rootDomain = ROOT_DOMAIN.split(":")[0]!
  const isSubdomain =
    hostname !== rootDomain &&
    hostname !== `www.${rootDomain}` &&
    hostname.endsWith(`.${rootDomain}`)

  if (isSubdomain) {
    return hostname.replace(`.${rootDomain}`, "")
  }

  return null
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

  const { data: tenant } = await supabase
    .from("tenants")
    .select("slug")
    .eq("slug", subdomain)
    .eq("active", true)
    .single()

  if (!tenant) {
    // Unknown subdomain: show a "Create your help center" page
    const url = request.nextUrl.clone()
    url.pathname = "/t/_not-found"
    return NextResponse.rewrite(url)
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

export { extractSubdomain, RESERVED_SLUGS }
