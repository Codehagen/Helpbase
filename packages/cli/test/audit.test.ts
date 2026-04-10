import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { execSync } from "node:child_process"

const CLI_PATH = path.resolve(__dirname, "../dist/index.js")

function run(args: string, cwd?: string): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(`node ${CLI_PATH} ${args}`, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, NO_COLOR: "1" },
    })
    return { stdout, exitCode: 0 }
  } catch (err: any) {
    return { stdout: (err.stdout ?? "") + (err.stderr ?? ""), exitCode: err.status ?? 1 }
  }
}

describe("helpbase audit", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-test-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("passes with valid content", () => {
    const contentDir = path.join(tmpDir, "content", "getting-started")
    fs.mkdirSync(contentDir, { recursive: true })

    fs.writeFileSync(
      path.join(contentDir, "_category.json"),
      JSON.stringify({ title: "Getting Started", description: "", order: 1 })
    )

    fs.writeFileSync(
      path.join(contentDir, "intro.mdx"),
      `---
schemaVersion: 1
title: "Introduction"
description: "Welcome"
---

# Hello
`
    )

    const result = run(`audit --dir ${path.join(tmpDir, "content")}`)
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("All content is healthy")
    expect(result.stdout).toContain("Categories: 1")
    expect(result.stdout).toContain("Articles:   1")
  })

  it("fails when frontmatter is missing title", () => {
    const contentDir = path.join(tmpDir, "content", "docs")
    fs.mkdirSync(contentDir, { recursive: true })

    fs.writeFileSync(
      path.join(contentDir, "bad.mdx"),
      `---
schemaVersion: 1
description: "No title here"
---

# Oops
`
    )

    const result = run(`audit --dir ${path.join(tmpDir, "content")}`)
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("missing title")
  })

  it("fails when frontmatter is missing description", () => {
    const contentDir = path.join(tmpDir, "content", "docs")
    fs.mkdirSync(contentDir, { recursive: true })

    fs.writeFileSync(
      path.join(contentDir, "bad.mdx"),
      `---
schemaVersion: 1
title: "Has title"
---

# Content
`
    )

    const result = run(`audit --dir ${path.join(tmpDir, "content")}`)
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("missing description")
  })

  it("warns when _category.json is missing", () => {
    const contentDir = path.join(tmpDir, "content", "docs")
    fs.mkdirSync(contentDir, { recursive: true })

    fs.writeFileSync(
      path.join(contentDir, "intro.mdx"),
      `---
schemaVersion: 1
title: "Intro"
description: "Desc"
---

# Hello
`
    )

    const result = run(`audit --dir ${path.join(tmpDir, "content")}`)
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("missing _category.json")
  })

  it("warns when a category has no articles", () => {
    const contentDir = path.join(tmpDir, "content", "empty-cat")
    fs.mkdirSync(contentDir, { recursive: true })

    fs.writeFileSync(
      path.join(contentDir, "_category.json"),
      JSON.stringify({ title: "Empty", description: "" })
    )

    const result = run(`audit --dir ${path.join(tmpDir, "content")}`)
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("has no articles")
  })

  // Regression: QA found audit saying "All content is healthy!" against an
  // empty content directory. That exit-0 footgun silently masked pipelines
  // pointing at the wrong directory. Found by /qa on 2026-04-09.
  it("warns and exits 1 when content directory exists but is empty", () => {
    const contentDir = path.join(tmpDir, "content")
    fs.mkdirSync(contentDir, { recursive: true })

    const result = run(`audit --dir ${contentDir}`)
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("no categories found")
    expect(result.stdout).toContain("--dir")
    expect(result.stdout).not.toContain("All content is healthy")
  })

  it("fails when content directory does not exist", () => {
    const result = run(`audit --dir ${path.join(tmpDir, "nonexistent")}`)
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("Content directory not found")
  })

  it("outputs valid JSON with --format json", () => {
    const contentDir = path.join(tmpDir, "content", "getting-started")
    fs.mkdirSync(contentDir, { recursive: true })

    fs.writeFileSync(
      path.join(contentDir, "_category.json"),
      JSON.stringify({ title: "Getting Started", description: "", order: 1 })
    )

    fs.writeFileSync(
      path.join(contentDir, "intro.mdx"),
      `---
schemaVersion: 1
title: "Introduction"
description: "Welcome"
---

# Hello
`
    )

    const result = run(`audit --dir ${path.join(tmpDir, "content")} --format json`)
    const parsed = JSON.parse(result.stdout)
    expect(parsed.categoryCount).toBe(1)
    expect(parsed.articleCount).toBe(1)
    expect(Array.isArray(parsed.issues)).toBe(true)
  })

  it("reports correct counts with multiple categories and articles", () => {
    // Category 1 with 2 articles
    const cat1 = path.join(tmpDir, "content", "guides")
    fs.mkdirSync(cat1, { recursive: true })
    fs.writeFileSync(path.join(cat1, "_category.json"), JSON.stringify({ title: "Guides" }))
    fs.writeFileSync(path.join(cat1, "a.mdx"), `---\nschemaVersion: 1\ntitle: "A"\ndescription: "A"\n---\n# A`)
    fs.writeFileSync(path.join(cat1, "b.mdx"), `---\nschemaVersion: 1\ntitle: "B"\ndescription: "B"\n---\n# B`)

    // Category 2 with 1 article
    const cat2 = path.join(tmpDir, "content", "api")
    fs.mkdirSync(cat2, { recursive: true })
    fs.writeFileSync(path.join(cat2, "_category.json"), JSON.stringify({ title: "API" }))
    fs.writeFileSync(path.join(cat2, "c.mdx"), `---\nschemaVersion: 1\ntitle: "C"\ndescription: "C"\n---\n# C`)

    const result = run(`audit --dir ${path.join(tmpDir, "content")}`)
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("Categories: 2")
    expect(result.stdout).toContain("Articles:   3")
  })
})
