import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"

/**
 * getCategories() silently fell back to defaults on any _category.json
 * parse failure — both JSON syntax errors and schema mismatches. Docs
 * authors who typo'd the file saw their custom title/icon ignored with
 * no feedback. Pin the warn behavior so both failure modes surface.
 */

describe("getCategories — _category.json parse failures", () => {
  let tmpDir: string
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-content-"))
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    vi.stubEnv("HELPBASE_CONTENT_DIR", tmpDir)
    vi.resetModules()
  })

  afterEach(() => {
    warnSpy.mockRestore()
    vi.unstubAllEnvs()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("warns and falls back to defaults when _category.json is not valid JSON", async () => {
    const catDir = path.join(tmpDir, "broken")
    fs.mkdirSync(catDir, { recursive: true })
    fs.writeFileSync(path.join(catDir, "_category.json"), "{ not valid json")
    fs.writeFileSync(
      path.join(catDir, "doc.mdx"),
      "---\nschemaVersion: 1\ntitle: X\ndescription: Y\norder: 1\n---\n\nbody",
    )

    const { getCategories } = await import("../lib/content")
    const cats = await getCategories()

    expect(cats).toHaveLength(1)
    expect(cats[0]?.slug).toBe("broken")
    expect(cats[0]?.title).toBe("Broken") // titleCase fallback
    const warnedCategory = warnSpy.mock.calls.some((args: unknown[]) =>
      args.some((a) => typeof a === "string" && a.includes("Could not parse _category.json") && a.includes("broken")),
    )
    expect(warnedCategory).toBe(true)
  })

  it("warns and falls back to defaults when _category.json fails the schema", async () => {
    const catDir = path.join(tmpDir, "typo-icon")
    fs.mkdirSync(catDir, { recursive: true })
    // Valid JSON but `order` is a string, which the schema rejects.
    fs.writeFileSync(
      path.join(catDir, "_category.json"),
      JSON.stringify({ title: "Typo", order: "not-a-number" }),
    )
    fs.writeFileSync(
      path.join(catDir, "doc.mdx"),
      "---\nschemaVersion: 1\ntitle: X\ndescription: Y\norder: 1\n---\n\nbody",
    )

    const { getCategories } = await import("../lib/content")
    const cats = await getCategories()

    expect(cats).toHaveLength(1)
    expect(cats[0]?.title).toBe("Typo Icon") // titleCase(slug) fallback, NOT the provided "Typo"
    const warnedSchema = warnSpy.mock.calls.some((args: unknown[]) =>
      args.some((a) => typeof a === "string" && a.includes("Invalid _category.json") && a.includes("typo-icon")),
    )
    expect(warnedSchema).toBe(true)
  })

  it("does not warn when _category.json is valid", async () => {
    const catDir = path.join(tmpDir, "good")
    fs.mkdirSync(catDir, { recursive: true })
    fs.writeFileSync(
      path.join(catDir, "_category.json"),
      JSON.stringify({ title: "Good", description: "ok", icon: "file-text", order: 1 }),
    )
    fs.writeFileSync(
      path.join(catDir, "doc.mdx"),
      "---\nschemaVersion: 1\ntitle: X\ndescription: Y\norder: 1\n---\n\nbody",
    )

    const { getCategories } = await import("../lib/content")
    const cats = await getCategories()

    expect(cats[0]?.title).toBe("Good")
    expect(warnSpy).not.toHaveBeenCalled()
  })
})
