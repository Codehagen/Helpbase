import { describe, it, expect } from "vitest"
import path from "node:path"
import fs from "node:fs"
import { execSync } from "node:child_process"

const CLI_PATH = path.resolve(__dirname, "../dist/index.js")

function run(args: string): { output: string; exitCode: number } {
  try {
    const stdout = execSync(`node ${CLI_PATH} ${args}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, NO_COLOR: "1" },
    })
    return { output: stdout, exitCode: 0 }
  } catch (err: any) {
    // Combine stdout and stderr since CLI may write to either
    const output = (err.stdout ?? "") + (err.stderr ?? "")
    return { output, exitCode: err.status ?? 1 }
  }
}

describe("helpbase generate", () => {
  it("shows helpful error when no source is provided", () => {
    const result = run("generate")
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("Provide a source")
    expect(result.output).toContain("--url")
    expect(result.output).toContain("--repo")
  })

  it("shows examples in the error output", () => {
    const result = run("generate")
    expect(result.output).toContain("helpbase generate --url")
    expect(result.output).toContain("--screenshots")
  })

  it("fails gracefully with an unreachable URL", () => {
    const result = run("generate --url http://localhost:99999")
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("Could not generate articles")
  })

  it("error output includes reason and fix", () => {
    const result = run("generate --url http://localhost:99999")
    expect(result.output).toContain("Reason:")
    expect(result.output).toContain("Fix:")
    expect(result.output).toContain("Docs:")
  })

  it("--repo fails cleanly when the path does not exist", () => {
    const result = run("generate --repo /tmp/definitely-does-not-exist-12345")
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("Could not read repository")
    expect(result.output).toContain("does not exist")
  })

  it("--repo fails cleanly when the directory has no markdown", () => {
    const emptyDir = path.resolve(__dirname, "fixtures/.empty-repo")
    try {
      fs.mkdirSync(emptyDir, { recursive: true })
      const result = run(`generate --repo ${emptyDir}`)
      expect(result.exitCode).toBe(1)
      expect(result.output).toContain("No markdown files found")
    } finally {
      try {
        fs.rmSync(emptyDir, { recursive: true, force: true })
      } catch {}
    }
  })

  it("--repo --dry-run reads markdown and prints a plan without calling the LLM", () => {
    const repoDir = path.resolve(__dirname, "fixtures/.sample-repo")
    const outDir = path.resolve(__dirname, "fixtures/.out-repo-dry-run")
    try {
      fs.mkdirSync(repoDir, { recursive: true })
      fs.writeFileSync(
        path.join(repoDir, "README.md"),
        "# Sample Project\n\n" +
          "This is a sample repository with enough content to pass the " +
          "minimum-length gate. ".repeat(30),
      )
      fs.mkdirSync(path.join(repoDir, "docs"), { recursive: true })
      fs.writeFileSync(
        path.join(repoDir, "docs/usage.md"),
        "# Usage\n\nInstall with npm and run the CLI. ".repeat(20),
      )

      const result = run(
        `generate --repo ${repoDir} --dry-run --output ${outDir}`,
      )
      expect(result.exitCode).toBe(0)
      expect(result.output).toContain("Dry run")
      expect(result.output).toContain("Repository:")
      expect(result.output).toContain("Markdown chars:")
    } finally {
      try {
        fs.rmSync(repoDir, { recursive: true, force: true })
        fs.rmSync(outDir, { recursive: true, force: true })
      } catch {}
    }
  })
})
