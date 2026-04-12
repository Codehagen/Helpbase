import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { validateArticle, AuditError } from "../src/audit.js"

function tmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-valart-"))
}

function writeArticle(
  root: string,
  category: string,
  slug: string,
  frontmatter: Record<string, unknown>,
  body: string = "",
): string {
  const categoryDir = path.join(root, category)
  fs.mkdirSync(categoryDir, { recursive: true })
  const filePath = path.join(categoryDir, `${slug}.mdx`)
  const fm = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join("\n")
  fs.writeFileSync(filePath, `---\n${fm}\n---\n\n${body}`)
  return filePath
}

describe("validateArticle", () => {
  let root: string
  beforeEach(() => {
    root = tmp()
  })
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it("returns [] for a clean article", () => {
    const file = writeArticle(root, "guides", "hello", {
      schemaVersion: 1,
      title: "Hello",
      description: "desc",
    })
    expect(validateArticle(file)).toEqual([])
  })

  it("flags missing title, description, schemaVersion", () => {
    const file = writeArticle(root, "guides", "empty", {})
    const issues = validateArticle(file)
    const messages = issues.map((i) => i.message)
    expect(messages).toContain("missing title")
    expect(messages).toContain("missing description")
    expect(messages).toContain("missing schemaVersion")
    expect(issues.every((i) => i.level === "error")).toBe(true)
  })

  it("flags invalid frontmatter as a single error", () => {
    const file = path.join(root, "guides", "broken.mdx")
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, "---\nnot: valid: yaml: at: all:\n---\n")
    const issues = validateArticle(file)
    expect(issues.some((i) => i.message === "invalid frontmatter")).toBe(true)
  })

  it("flags unknown MDX components", () => {
    const file = writeArticle(
      root,
      "guides",
      "mdx",
      { schemaVersion: 1, title: "t", description: "d" },
      "<NotAComponent />",
    )
    const issues = validateArticle(file)
    expect(issues.some((i) => i.message.includes("<NotAComponent>"))).toBe(true)
  })

  it("allows valid MDX components", () => {
    const file = writeArticle(
      root,
      "guides",
      "mdx-ok",
      { schemaVersion: 1, title: "t", description: "d" },
      "<Callout>hi</Callout>\n<CardGroup><Card /></CardGroup>",
    )
    expect(validateArticle(file)).toEqual([])
  })

  it("flags missing heroImage on disk", () => {
    const file = writeArticle(root, "guides", "hero", {
      schemaVersion: 1,
      title: "t",
      description: "d",
      heroImage: "hero.png",
    })
    const issues = validateArticle(file)
    expect(issues.some((i) => i.message.includes("heroImage"))).toBe(true)
  })

  it("passes when heroImage exists in the article's asset dir", () => {
    const file = writeArticle(root, "guides", "hero", {
      schemaVersion: 1,
      title: "t",
      description: "d",
      heroImage: "hero.png",
    })
    fs.mkdirSync(path.join(root, "guides", "hero"), { recursive: true })
    fs.writeFileSync(path.join(root, "guides", "hero", "hero.png"), "")
    expect(validateArticle(file)).toEqual([])
  })

  it("flags markdown image references that point to missing files", () => {
    const file = writeArticle(
      root,
      "guides",
      "img",
      { schemaVersion: 1, title: "t", description: "d" },
      "![alt](./missing.png)",
    )
    const issues = validateArticle(file)
    expect(issues.some((i) => i.message.includes("missing.png"))).toBe(true)
  })

  it("throws AuditError for non-existent paths", () => {
    expect(() => validateArticle(path.join(root, "nope.mdx"))).toThrow(AuditError)
  })

  it("throws AuditError for non-article extensions", () => {
    const file = path.join(root, "guides", "x.txt")
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, "hi")
    expect(() => validateArticle(file)).toThrow(AuditError)
  })

  it("ignores JSX tags inside fenced code blocks", () => {
    const file = writeArticle(
      root,
      "guides",
      "code",
      { schemaVersion: 1, title: "t", description: "d" },
      "```\n<FakeComponent />\n```",
    )
    expect(validateArticle(file)).toEqual([])
  })
})
