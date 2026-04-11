import { describe, it, expect } from "vitest"
import path from "node:path"
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

  // Regression: QA found --repo exited 0 with "coming soon" message.
  // This is a silent CI failure — pipelines thought articles were generated
  // when nothing happened. /qa on 2026-04-09 caught it.
  // Report: .gstack/qa-reports/qa-report-helpbase-cli-2026-04-09.md
  it("--repo exits 1 because repo generation is not yet implemented", () => {
    const result = run("generate --repo /tmp/any-path")
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("not yet implemented")
    expect(result.output).toContain("--url")
  })
})
