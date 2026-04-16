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

  it("--reuse-existing without --ask surfaces E_CONTEXT_REUSE_WITHOUT_ASK", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-ctx-reuse-"))
    try {
      fs.writeFileSync(path.join(tmp, "README.md"), "# Hello\n\nsample")
      const result = run(`context ${tmp} --reuse-existing`)
      expect(result.exitCode).toBe(1)
      expect(result.output).toContain("E_CONTEXT_REUSE_WITHOUT_ASK")
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it("--reuse-existing --ask with empty .helpbase surfaces E_CONTEXT_REUSE_EMPTY", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-ctx-reuse-"))
    try {
      fs.writeFileSync(path.join(tmp, "README.md"), "# Hello\n\nsample")
      // No .helpbase/docs directory exists — reuse should fail loudly.
      const result = run(`context ${tmp} --reuse-existing --ask "anything"`)
      expect(result.exitCode).toBe(1)
      expect(result.output).toContain("E_CONTEXT_REUSE_EMPTY")
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it("resolves project name from package.json, not the containing directory (regression)", async () => {
    // Temp dirs have names like `helpbase-user-test-znh2Rp`. Without this
    // fix, that string ended up in the LLM prompt and in llms.txt as the
    // project's display name — drowning out the `name: "todo-app"` the
    // user set in their package.json.
    const { resolveProjectName } = await import("../src/commands/context.js")
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-name-regression-"))
    try {
      fs.writeFileSync(
        path.join(tmp, "package.json"),
        JSON.stringify({ name: "todo-app", version: "0.1.0" }),
      )
      expect(resolveProjectName(tmp)).toBe("todo-app")
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it("falls back to the directory basename when package.json has no name", async () => {
    const { resolveProjectName } = await import("../src/commands/context.js")
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-noname-"))
    try {
      fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ version: "0.1.0" }))
      expect(resolveProjectName(tmp)).toBe(path.basename(tmp))
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it("falls back to the directory basename when there is no package.json at all", async () => {
    const { resolveProjectName } = await import("../src/commands/context.js")
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-nopkg-"))
    try {
      expect(resolveProjectName(tmp)).toBe(path.basename(tmp))
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it("--reuse-existing --ask with a populated .helpbase/docs reaches the LLM call (fast path, no walk)", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-ctx-reuse-"))
    try {
      // Seed a pre-generated doc on disk — the fast path reads these.
      const docsDir = path.join(tmp, ".helpbase", "docs", "getting-started")
      fs.mkdirSync(docsDir, { recursive: true })
      fs.writeFileSync(
        path.join(docsDir, "how-to-log-in.mdx"),
        [
          "---",
          "schemaVersion: 1",
          'title: "How to log in"',
          'description: "Log in with a magic link."',
          "tags: []",
          "order: 1",
          "---",
          "",
          "Call POST /api/auth/login with email and password.",
          "",
        ].join("\n"),
      )
      // No AI key and no source walk — the fast path goes straight to
      // runLocalAsk, which needs a key. Observable behavior: we get past
      // the walker (no NO_SOURCES, no REPO_PATH error) and fail at the
      // LLM call with a gateway/key error, NOT at the pipeline gate.
      const result = runWithEnv(
        `context ${tmp} --reuse-existing --ask "how do I log in?"`,
        {
          AI_GATEWAY_API_KEY: "vck_this_is_not_a_real_key_abcdefghijklmnop",
        },
      )
      // The run should fail at the LLM boundary, not the reuse gate.
      expect(result.output).not.toContain("E_CONTEXT_REUSE_EMPTY")
      expect(result.output).not.toContain("E_CONTEXT_REUSE_WITHOUT_ASK")
      expect(result.output).not.toContain("E_CONTEXT_NO_SOURCES")
      // The Answering line proves we reached runLocalAsk's prompt stage.
      expect(result.output).toContain("Answering:")
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
