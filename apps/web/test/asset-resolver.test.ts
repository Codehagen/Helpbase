import { describe, it, expect } from "vitest"
import { resolveAssetPath, PathTraversalError } from "../lib/assets"

describe("resolveAssetPath", () => {
  it("resolves a simple filename", () => {
    expect(resolveAssetPath("getting-started", "intro", "hero.png")).toBe(
      "/_helpbase-assets/getting-started/intro/hero.png",
    )
  })

  it("resolves a nested path", () => {
    expect(resolveAssetPath("guides", "setup", "images/screenshot.png")).toBe(
      "/_helpbase-assets/guides/setup/images/screenshot.png",
    )
  })

  // --- Security: path traversal rejection ---

  it("rejects parent directory traversal (../)", () => {
    expect(() =>
      resolveAssetPath("getting-started", "intro", "../../etc/passwd"),
    ).toThrow(PathTraversalError)
  })

  it("rejects absolute paths", () => {
    expect(() =>
      resolveAssetPath("getting-started", "intro", "/etc/passwd"),
    ).toThrow(PathTraversalError)
  })

  it("rejects backslash paths", () => {
    expect(() =>
      resolveAssetPath("getting-started", "intro", "..\\..\\secrets"),
    ).toThrow(PathTraversalError)
  })

  it("rejects null bytes", () => {
    expect(() =>
      resolveAssetPath("getting-started", "intro", "hero\0.png"),
    ).toThrow(PathTraversalError)
  })

  it("rejects URL schemes", () => {
    expect(() =>
      resolveAssetPath("getting-started", "intro", "https://evil.com/img.png"),
    ).toThrow(PathTraversalError)
  })

  it("rejects javascript: scheme", () => {
    expect(() =>
      resolveAssetPath("getting-started", "intro", "javascript:alert(1)"),
    ).toThrow(PathTraversalError)
  })
})
