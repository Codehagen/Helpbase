import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { execSync, execFileSync } from "node:child_process"

const CLI_PATH = path.resolve(__dirname, "../dist/index.js")

function run(args: string, cwd: string): { stdout: string; exitCode: number } {
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

// Spawns the CLI with argv passed as an array so we can include quotes,
// backslashes, and other shell-sensitive characters in the arguments
// without worrying about shell escaping.
function runArgs(args: string[], cwd: string): { stdout: string; exitCode: number } {
  try {
    const stdout = execFileSync("node", [CLI_PATH, ...args], {
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

// Minimal YAML frontmatter parser: extracts a JSON-encoded string value for
// a given key from between the --- fences. Good enough to assert round-trip
// safety for quoted/escaped strings.
function parseFrontmatterField(mdx: string, key: string): string | null {
  const match = mdx.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return null
  const body = match[1]!
  const line = body.split("\n").find((l) => l.startsWith(`${key}:`))
  if (!line) return null
  const raw = line.slice(key.length + 1).trim()
  // JSON.parse handles the JSON.stringify-encoded value written by the CLI.
  return JSON.parse(raw)
}

describe("helpbase new — templates", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-new-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  const cases: Array<{
    type: string
    category: string
    signatureComponents: string[]
  }> = [
    {
      type: "getting-started",
      category: "getting-started",
      signatureComponents: ["<Steps>", "<Callout", "<CardGroup"],
    },
    {
      type: "how-to",
      category: "how-to-guides",
      signatureComponents: ["<Steps>", '<Callout type="info"', '<Callout type="warning"', "<CardGroup"],
    },
    {
      type: "concept",
      category: "concepts",
      signatureComponents: ['<Callout type="tip"', "<CardGroup"],
    },
    {
      type: "troubleshooting",
      category: "troubleshooting",
      signatureComponents: ["<Steps>", "<Callout", "<CardGroup"],
    },
  ]

  for (const { type, category, signatureComponents } of cases) {
    it(`creates a ${type} article with its signature MDX components`, () => {
      const result = run(`new --type ${type} --title "Test Article" --dir content`, tmpDir)
      expect(result.exitCode).toBe(0)

      const filePath = path.join(tmpDir, "content", category, "test-article.mdx")
      expect(fs.existsSync(filePath)).toBe(true)

      const content = fs.readFileSync(filePath, "utf-8")
      for (const component of signatureComponents) {
        expect(content).toContain(component)
      }
      expect(content).toContain("schemaVersion: 1")
    })

    it(`creates an asset directory for ${type}`, () => {
      run(`new --type ${type} --title "Test Article" --dir content`, tmpDir)
      const assetDir = path.join(tmpDir, "content", category, "test-article")
      expect(fs.existsSync(assetDir)).toBe(true)
      expect(fs.statSync(assetDir).isDirectory()).toBe(true)
    })
  }
})

describe("helpbase new — flag mode", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-new-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("respects --category override", () => {
    const result = run(
      `new --type how-to --title "Reset password" --category account --dir content`,
      tmpDir,
    )
    expect(result.exitCode).toBe(0)
    const filePath = path.join(tmpDir, "content", "account", "reset-password.mdx")
    expect(fs.existsSync(filePath)).toBe(true)
  })

  it("threads --description into the frontmatter", () => {
    const result = run(
      `new --type concept --title "Workspaces" --description "How workspaces group your data." --dir content`,
      tmpDir,
    )
    expect(result.exitCode).toBe(0)
    const filePath = path.join(tmpDir, "content", "concepts", "workspaces.mdx")
    const content = fs.readFileSync(filePath, "utf-8")
    expect(parseFrontmatterField(content, "description")).toBe(
      "How workspaces group your data.",
    )
  })

  it("rejects unknown template type with valid types list", () => {
    const result = run(
      `new --type nonexistent --title "Test" --dir content`,
      tmpDir,
    )
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("Unknown template type")
    expect(result.stdout).toContain("troubleshooting")
  })

  it("exits 1 when article already exists", () => {
    run(`new --type how-to --title "Dup" --dir content`, tmpDir)
    const result = run(`new --type how-to --title "Dup" --dir content`, tmpDir)
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("already exists")
  })
})

describe("helpbase new — title injection safety (regression)", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-new-"))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  // Titles containing quotes or backslashes previously broke the YAML
  // frontmatter via naive string interpolation. Guard with JSON-encoded
  // values so the written file parses back to the exact input.
  it("preserves double quotes in the title via JSON-encoded frontmatter", () => {
    const result = runArgs(
      ["new", "--type", "how-to", "--title", 'Fix "broken" builds', "--dir", "content"],
      tmpDir,
    )
    expect(result.exitCode).toBe(0)

    const filePath = path.join(tmpDir, "content", "how-to-guides", "fix-broken-builds.mdx")
    expect(fs.existsSync(filePath)).toBe(true)

    const content = fs.readFileSync(filePath, "utf-8")
    expect(parseFrontmatterField(content, "title")).toBe('Fix "broken" builds')
  })

  it("preserves backslashes in descriptions", () => {
    const result = runArgs(
      [
        "new",
        "--type",
        "concept",
        "--title",
        "Paths",
        "--description",
        "Use C:\\Users on Windows",
        "--dir",
        "content",
      ],
      tmpDir,
    )
    expect(result.exitCode).toBe(0)

    const filePath = path.join(tmpDir, "content", "concepts", "paths.mdx")
    const content = fs.readFileSync(filePath, "utf-8")
    expect(parseFrontmatterField(content, "description")).toBe("Use C:\\Users on Windows")
  })
})
