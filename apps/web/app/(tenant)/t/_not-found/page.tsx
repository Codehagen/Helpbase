import { notFound } from "next/navigation"

/**
 * Tenant "not found" page. Rendered by the subdomain middleware for:
 *   - unknown subdomains (never-existed tenants)
 *   - reserved tenants at deep-link paths (articles/search/etc. — root
 *     `/` still routes to the branded "coming soon" landing)
 *
 * Calling `notFound()` is the load-bearing bit: Next.js converts it into
 * a true HTTP 404 response (not a 200 with "not found" copy). That
 * matters because middleware-level rewrites preserve the destination's
 * status, and we want crawlers + MCP clients + monitoring tools hitting
 * unknown or reserved subdomain paths to see "nope, nothing here" at
 * the protocol level, not "here's a page that claims nothing is here."
 * The previous implementation rendered a 200 HTML page with a "Create
 * your help center" CTA; that CTA can come back as a proper
 * `not-found.tsx` route later. Ship correctness first.
 * Caught by /review codex on 2026-04-18.
 */
export default function TenantNotFound(): never {
  notFound()
}
