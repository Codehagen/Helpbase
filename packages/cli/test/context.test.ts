import { describe, it, expect } from "vitest"
import path from "node:path"
import fs from "node:fs"
import os from "node:os"
import { execSync } from "node:child_process"

const CLI_PATH = path.resolve(__dirname, "../dist/index.js")

function run(args: string): { output: string; exitCode: number } {
  return runWithEnv(args, {})
}

function runWithEnv(
  args: string,
  envOverrides: Record<string, string>,
): { output: string; exitCode: number } {
  // Merge stdout + stderr on both success and failure — context writes
  // diagnostic notices + error catalog output to stderr, and tests want to
  // assert on the full user-visible output regardless of exit code.
  try {
    const stdout = execSync(`node ${CLI_PATH} ${args} 2>&1`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, NO_COLOR: "1", ...envOverrides },
    })
    return { output: stdout, exitCode: 0 }
  } catch (err: any) {
    const output = (err.stdout ?? "") + (err.stderr ?? "")
    return { output, exitCode: err.status ?? 1 }
  }
}

describe("helpbase context", () => {
  it("advertises itself in --help", () => {
    const result = run("context --help")
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("context")
    expect(result.output).toContain("--max-tokens")
    expect(result.output).toContain("--ask")
    expect(result.output).toContain("--only")
    expect(result.output).toContain("--prompt")
    expect(result.output).toContain("--require-clean")
  })

  it("documents BYOK env vars in help examples", () => {
    const result = run("context --help")
    expect(result.output).toContain("ANTHROPIC_API_KEY")
    expect(result.output).toContain("OPENAI_API_KEY")
    expect(result.output).toContain("AI_GATEWAY_API_KEY")
  })

  it("--dry-run on a repo with no eligible files errors with E_CONTEXT_NO_SOURCES", () => {
    // Empty temp dir has nothing to walk → helpful error, not a crash.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-ctx-empty-"))
    try {
      const result = run(`context ${tmp} --dry-run`)
      // No sources available; even --dry-run goes through the walker.
      expect(result.exitCode).toBe(1)
      expect(result.output).toContain("E_CONTEXT_NO_SOURCES")
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it("missing API key on a real repo surfaces E_CONTEXT_MISSING_KEY", () => {
    // Create a minimal repo the walker likes.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-ctx-nokey-"))
    try {
      fs.writeFileSync(path.join(tmp, "README.md"), "# Hello\n\nsample repo for test")
      const result = runWithEnv(`context ${tmp}`, {
        AI_GATEWAY_API_KEY: "",
        ANTHROPIC_API_KEY: "",
        OPENAI_API_KEY: "",
      })
      expect(result.exitCode).toBe(1)
      expect(result.output).toContain("E_CONTEXT_MISSING_KEY")
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it("invalid repo path surfaces E_CONTEXT_REPO_PATH", () => {
    const result = run("context /tmp/helpbase-does-not-exist-ctx-test")
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("E_CONTEXT_REPO_PATH")
  })

  it("--dry-run on a real repo prints a plan without an LLM call", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-ctx-dry-"))
    try {
      fs.writeFileSync(path.join(tmp, "README.md"), "# Hello\n\nsample repo for test")
      fs.writeFileSync(path.join(tmp, "index.ts"), "export const one = 1")
      // Dry-run does not need a key.
      const result = runWithEnv(`context ${tmp} --dry-run`, {
        AI_GATEWAY_API_KEY: "",
        ANTHROPIC_API_KEY: "",
        OPENAI_API_KEY: "",
      })
      expect(result.exitCode).toBe(0)
      expect(result.output).toContain("Dry run")
      expect(result.output).toContain("Sources found:")
      expect(result.output).toContain("Estimated tokens:")
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
})

describe("helpbase generate positional alias", () => {
  it("accepts a positional path as an alias for --repo", () => {
    // With neither --url, --repo, nor --screenshots, and no positional,
    // generate must error. With a positional path but no --repo flag, the
    // alias kicks in and the command proceeds to path-existence checks.
    // We can observe the alias indirectly: a bogus path yields a repo
    // error, not the "Provide a source" error.
    const result = run("generate /tmp/definitely-does-not-exist-helpbase-alias-test")
    expect(result.exitCode).toBe(1)
    // The alias should have mapped to --repo; the error is about the repo path, not missing source.
    expect(result.output).not.toContain("Provide a source")
  })

  it("still shows the source error when no positional and no flags", () => {
    const result = run("generate")
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("Provide a source")
  })
})
