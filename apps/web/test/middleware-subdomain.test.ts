import { describe, it, expect } from "vitest"
import { extractSubdomainFromHost, RESERVED_SLUGS } from "../proxy"

/**
 * Tests for the pure-string subdomain extractor that drives `proxy.ts`
 * (renamed from `middleware.ts` in Next.js 16). The test file keeps its
 * old name as a git-friendly rename-shadow.
 */

describe("extractSubdomainFromHost", () => {
  it("extracts subdomain from production tenant URLs", () => {
    expect(extractSubdomainFromHost("acme.helpbase.dev")).toBe("acme")
    expect(extractSubdomainFromHost("acme-docs.helpbase.dev")).toBe("acme-docs")
    expect(extractSubdomainFromHost("acme.helpbase.dev:443")).toBe("acme")
  })

  it("extracts subdomain from local-dev *.localhost", () => {
    expect(extractSubdomainFromHost("acme.localhost:3000")).toBe("acme")
    expect(extractSubdomainFromHost("acme-docs.localhost")).toBe("acme-docs")
  })

  it("returns null for the apex domain", () => {
    expect(extractSubdomainFromHost("helpbase.dev")).toBe(null)
    expect(extractSubdomainFromHost("helpbase.dev:443")).toBe(null)
    expect(extractSubdomainFromHost("localhost")).toBe(null)
    expect(extractSubdomainFromHost("localhost:3000")).toBe(null)
  })

  it("returns null for www on the apex domain", () => {
    expect(extractSubdomainFromHost("www.helpbase.dev")).toBe(null)
    expect(extractSubdomainFromHost("www.helpbase.dev:443")).toBe(null)
  })

  it("extracts subdomain from Vercel preview tenant URLs (tenant---branch.vercel.app)", () => {
    expect(extractSubdomainFromHost("acme---main.vercel.app")).toBe("acme")
    expect(extractSubdomainFromHost("acme---feature-branch.vercel.app")).toBe("acme")
  })

  it("returns null for bare Vercel preview URLs (no --- separator)", () => {
    expect(extractSubdomainFromHost("helpbase-git-main.vercel.app")).toBe(null)
    expect(extractSubdomainFromHost("helpbase-abc123.vercel.app")).toBe(null)
  })

  it("returns null for IP addresses", () => {
    expect(extractSubdomainFromHost("127.0.0.1:3000")).toBe(null)
    expect(extractSubdomainFromHost("192.168.1.5:8080")).toBe(null)
    expect(extractSubdomainFromHost("10.0.0.1")).toBe(null)
  })

  it("returns null for null / missing / empty host", () => {
    expect(extractSubdomainFromHost(null)).toBe(null)
    expect(extractSubdomainFromHost(undefined)).toBe(null)
    expect(extractSubdomainFromHost("")).toBe(null)
  })

  it("returns null for unknown apex domains (don't assume tenant routing)", () => {
    expect(extractSubdomainFromHost("foo.someone-elses-site.com")).toBe(null)
    expect(extractSubdomainFromHost("not-ours.dev")).toBe(null)
  })

  it("lowercases the subdomain", () => {
    expect(extractSubdomainFromHost("Acme.helpbase.dev")).toBe("acme")
    expect(extractSubdomainFromHost("ACME.helpbase.dev")).toBe("acme")
  })
})

describe("RESERVED_SLUGS", () => {
  it("includes marketing / infra / auth subdomains that must NOT route to tenants", () => {
    for (const slug of [
      "www",
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
    ]) {
      expect(RESERVED_SLUGS.has(slug)).toBe(true)
    }
  })

  it("does NOT include normal tenant-shaped slugs", () => {
    expect(RESERVED_SLUGS.has("acme")).toBe(false)
    expect(RESERVED_SLUGS.has("acme-docs")).toBe(false)
    expect(RESERVED_SLUGS.has("my-product")).toBe(false)
  })
})
