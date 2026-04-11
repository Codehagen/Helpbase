import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { auditContent, AuditError, VALID_MDX_COMPONENTS } from "../src/audit.js"

describe("auditContent", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-audit-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  function writeArticle(
    category: string,
    filename: string,
    frontmatter: Record<string, unknown>
  ) {
    const dir = path.join(tmpDir, category)
    fs.mkdirSync(dir, { recursive: true })
    const fm = Object.entries(frontmatter)
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join("\n")
    fs.writeFileSync(path.join(dir, filename), `---\n${fm}\n---\n\n# Content\n`)
  }

  function writeCategoryMeta(category: string) {
    const dir = path.join(tmpDir, category)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(
      path.join(dir, "_category.json"),
      JSON.stringify({ title: category, description: "" })
    )
  }

  // --- Happy path ---

  it("returns zero issues for valid content", () => {
    writeCategoryMeta("guides")
    writeArticle("guides", "intro.mdx", {
      schemaVersion: 1,
      title: "Intro",
      description: "Welcome",
    })

    const result = auditContent(tmpDir)
    expect(result.issues).toHaveLength(0)
    expect(result.categoryCount).toBe(1)
    expect(result.articleCount).toBe(1)
  })

  it("counts multiple categories and articles", () => {
    writeCategoryMeta("guides")
    writeArticle("guides", "a.mdx", { schemaVersion: 1, title: "A", description: "A" })
    writeArticle("guides", "b.mdx", { schemaVersion: 1, title: "B", description: "B" })

    writeCategoryMeta("api")
    writeArticle("api", "c.mdx", { schemaVersion: 1, title: "C", description: "C" })

    const result = auditContent(tmpDir)
    expect(result.categoryCount).toBe(2)
    expect(result.articleCount).toBe(3)
    expect(result.issues).toHaveLength(0)
  })

  // --- Validation errors ---

  it("reports missing title as error", () => {
    writeArticle("docs", "bad.mdx", { schemaVersion: 1, description: "Desc" })

    const result = auditContent(tmpDir)
    expect(result.issues).toHaveLength(2) // missing title + missing _category.json
    expect(result.issues.find((i) => i.message === "missing title")).toBeDefined()
    expect(result.issues.find((i) => i.message === "missing title")?.level).toBe("error")
  })

  it("reports missing description as error", () => {
    writeArticle("docs", "bad.mdx", { schemaVersion: 1, title: "Title" })

    const result = auditContent(tmpDir)
    const issue = result.issues.find((i) => i.message === "missing description")
    expect(issue).toBeDefined()
    expect(issue?.level).toBe("error")
  })

  it("reports missing schemaVersion as error", () => {
    writeArticle("docs", "bad.mdx", { title: "Title", description: "Desc" })

    const result = auditContent(tmpDir)
    const issue = result.issues.find((i) => i.message === "missing schemaVersion")
    expect(issue).toBeDefined()
    expect(issue?.level).toBe("error")
  })

  it("reports all missing fields in a single article", () => {
    writeArticle("docs", "empty.mdx", {})

    const result = auditContent(tmpDir)
    const errors = result.issues.filter((i) => i.file === "docs/empty.mdx")
    expect(errors).toHaveLength(3) // title, description, schemaVersion
  })

  // --- Structural warnings ---

  it("warns when _category.json is missing", () => {
    writeArticle("docs", "intro.mdx", {
      schemaVersion: 1,
      title: "Intro",
      description: "Desc",
    })

    const result = auditContent(tmpDir)
    const warning = result.issues.find((i) => i.message === "missing _category.json")
    expect(warning).toBeDefined()
    expect(warning?.level).toBe("warning")
  })

  it("warns when a category has no articles", () => {
    writeCategoryMeta("empty-cat")

    const result = auditContent(tmpDir)
    const warning = result.issues.find((i) => i.message === "has no articles")
    expect(warning).toBeDefined()
    expect(warning?.level).toBe("warning")
  })

  // Regression: QA found audit saying "All content is healthy!" against an
  // empty content directory with zero categories. That silently masked
  // misconfigured CI pipelines. Now an empty content dir emits a warning
  // which bubbles up to exit 1 in the command wrapper.
  // Found by /qa on 2026-04-09.
  it("warns when the content directory has zero categories", () => {
    // tmpDir is freshly-created and empty — zero categories, zero articles
    const result = auditContent(tmpDir)
    expect(result.categoryCount).toBe(0)
    expect(result.articleCount).toBe(0)
    const warning = result.issues.find((i) =>
      i.message.includes("no categories found"),
    )
    expect(warning).toBeDefined()
    expect(warning?.level).toBe("warning")
    expect(warning?.message).toContain("--dir")
  })

  // --- Error handling ---

  it("throws AuditError for nonexistent directory", () => {
    expect(() => auditContent("/tmp/does-not-exist-12345")).toThrow(AuditError)
  })

  it("handles invalid frontmatter gracefully", () => {
    const dir = path.join(tmpDir, "broken")
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, "bad.mdx"), "not valid frontmatter at all {{{}}")

    const result = auditContent(tmpDir)
    // gray-matter is lenient, so this may parse as empty frontmatter
    // which means missing fields, not a parse error
    expect(result.articleCount).toBe(1)
    expect(result.issues.length).toBeGreaterThan(0)
  })

  // --- Edge cases ---

  it("ignores non-mdx files", () => {
    writeCategoryMeta("docs")
    writeArticle("docs", "real.mdx", { schemaVersion: 1, title: "T", description: "D" })
    fs.writeFileSync(path.join(tmpDir, "docs", "readme.txt"), "not an article")
    fs.writeFileSync(path.join(tmpDir, "docs", "image.png"), "fake image")

    const result = auditContent(tmpDir)
    expect(result.articleCount).toBe(1)
  })

  it("handles .md files alongside .mdx", () => {
    writeCategoryMeta("docs")
    writeArticle("docs", "one.mdx", { schemaVersion: 1, title: "A", description: "A" })

    const mdDir = path.join(tmpDir, "docs")
    fs.writeFileSync(
      path.join(mdDir, "two.md"),
      `---\nschemaVersion: 1\ntitle: "B"\ndescription: "B"\n---\n# B\n`
    )

    const result = auditContent(tmpDir)
    expect(result.articleCount).toBe(2)
    expect(result.issues.filter((i) => i.level === "error")).toHaveLength(0)
  })

  // --- New checks: heroImage, MDX components, unused files ---

  it("reports missing heroImage file as error", () => {
    const dir = path.join(tmpDir, "guides")
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(
      path.join(dir, "setup.mdx"),
      `---\nschemaVersion: 1\ntitle: "Setup"\ndescription: "D"\nheroImage: "missing.png"\n---\n# Setup\n`,
    )

    const result = auditContent(tmpDir)
    const issue = result.issues.find((i) => i.message.includes("heroImage"))
    expect(issue).toBeDefined()
    expect(issue?.level).toBe("error")
    expect(issue?.message).toContain("missing.png")
  })

  it("reports unknown MDX component names as error", () => {
    writeCategoryMeta("docs")
    const dir = path.join(tmpDir, "docs")
    fs.writeFileSync(
      path.join(dir, "bad.mdx"),
      `---\nschemaVersion: 1\ntitle: "T"\ndescription: "D"\n---\n\n<UnknownWidget>hi</UnknownWidget>\n`,
    )

    const result = auditContent(tmpDir)
    const issue = result.issues.find((i) => i.message.includes("UnknownWidget"))
    expect(issue).toBeDefined()
    expect(issue?.level).toBe("error")
    expect(issue?.message).toContain("valid components")
  })

  it("accepts all valid MDX components without errors", () => {
    writeCategoryMeta("docs")
    const dir = path.join(tmpDir, "docs")
    const components = [...VALID_MDX_COMPONENTS].map((c) => `<${c}>x</${c}>`).join("\n")
    fs.writeFileSync(
      path.join(dir, "all.mdx"),
      `---\nschemaVersion: 1\ntitle: "T"\ndescription: "D"\n---\n\n${components}\n`,
    )

    const result = auditContent(tmpDir)
    const componentErrors = result.issues.filter((i) => i.message.includes("unknown MDX"))
    expect(componentErrors).toHaveLength(0)
  })

  it("warns about unused asset files", () => {
    writeCategoryMeta("guides")
    writeArticle("guides", "setup.mdx", { schemaVersion: 1, title: "T", description: "D" })

    // Create an asset dir with an unreferenced file
    const assetDir = path.join(tmpDir, "guides", "setup")
    fs.mkdirSync(assetDir, { recursive: true })
    fs.writeFileSync(path.join(assetDir, "orphan.png"), "fake")

    const result = auditContent(tmpDir)
    const warning = result.issues.find((i) => i.message.includes("unused asset"))
    expect(warning).toBeDefined()
    expect(warning?.level).toBe("warning")
    expect(warning?.message).toContain("orphan.png")
  })

  it("errors when a Figure src references a missing file", () => {
    writeCategoryMeta("guides")
    const dir = path.join(tmpDir, "guides")
    fs.writeFileSync(
      path.join(dir, "setup.mdx"),
      `---\nschemaVersion: 1\ntitle: "T"\ndescription: "D"\n---\n\n<Figure src="./missing-shot.png" alt="A screenshot" />\n`,
    )

    const result = auditContent(tmpDir)
    const issue = result.issues.find((i) => i.message.includes("missing-shot.png"))
    expect(issue).toBeDefined()
    expect(issue?.level).toBe("error")
    expect(issue?.message).toContain("not found")
  })

  it("passes when a Figure src references an existing file", () => {
    writeCategoryMeta("guides")
    const dir = path.join(tmpDir, "guides")
    fs.writeFileSync(
      path.join(dir, "setup.mdx"),
      `---\nschemaVersion: 1\ntitle: "T"\ndescription: "D"\n---\n\n<Figure src="./01-dashboard.png" alt="Dashboard" />\n`,
    )

    const assetDir = path.join(dir, "setup")
    fs.mkdirSync(assetDir, { recursive: true })
    fs.writeFileSync(path.join(assetDir, "01-dashboard.png"), "fake-png")

    const result = auditContent(tmpDir)
    const errors = result.issues.filter(
      (i) => i.level === "error" && i.message.includes("01-dashboard.png"),
    )
    expect(errors).toHaveLength(0)
  })

  it("does not warn about referenced asset files", () => {
    writeCategoryMeta("guides")
    const dir = path.join(tmpDir, "guides")
    fs.writeFileSync(
      path.join(dir, "setup.mdx"),
      `---\nschemaVersion: 1\ntitle: "T"\ndescription: "D"\nheroImage: "hero.png"\n---\n\n<Figure src="hero.png" />\n`,
    )

    const assetDir = path.join(dir, "setup")
    fs.mkdirSync(assetDir, { recursive: true })
    fs.writeFileSync(path.join(assetDir, "hero.png"), "fake")

    const result = auditContent(tmpDir)
    const warnings = result.issues.filter((i) => i.message.includes("unused asset"))
    expect(warnings).toHaveLength(0)
  })
})
