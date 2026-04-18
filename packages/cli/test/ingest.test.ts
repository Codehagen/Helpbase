import { describe, it, expect, beforeAll, afterAll } from "vitest"
import path from "node:path"
import fs from "node:fs"
import os from "node:os"
import { execSync } from "node:child_process"

const CLI_PATH = path.resolve(__dirname, "../dist/index.js")

// Isolated HOME + HELPBASE_* scrub so tests never consume the developer's
// real `~/.helpbase/auth.json`. Without this, tests asserting "E_AUTH_REQUIRED"
// pass in CI (clean HOME) but fail on any contributor laptop that has run
// `helpbase login` — a stealth paid-LLM call path. Caught by /review:
// ingest.test.ts hermeticity finding, 2026-04-18.
let FAKE_HOME: string
beforeAll(() => {
  FAKE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-test-home-"))
})
afterAll(() => {
  fs.rmSync(FAKE_HOME, { recursive: true, force: true })
})

function run(args: string): { output: string; exitCode: number } {
  return runWithEnv(args, {})
}

function runWithEnv(
  args: string,
  envOverrides: Record<string, string>,
): { output: string; exitCode: number } {
  // Merge stdout + stderr on both success and failure — ingest writes
  // diagnostic notices + error catalog output to stderr, and tests want to
  // assert on the full user-visible output regardless of exit code.
  try {
    const stdout = execSync(`node ${CLI_PATH} ${args} 2>&1`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        NO_COLOR: "1",
        // Hermetic auth isolation — see beforeAll note above.
        HOME: FAKE_HOME,
        USERPROFILE: FAKE_HOME,
        HELPBASE_TOKEN: "",
        ...envOverrides,
      },
    })
    return { output: stdout, exitCode: 0 }
  } catch (err: any) {
    const output = (err.stdout ?? "") + (err.stderr ?? "")
    return { output, exitCode: err.status ?? 1 }
  }
}

describe("helpbase ingest", () => {
  it("advertises itself in --help", () => {
    const result = run("ingest --help")
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("ingest")
    expect(result.output).toContain("--max-tokens")
    expect(result.output).toContain("--ask")
    expect(result.output).toContain("--only")
    expect(result.output).toContain("--prompt")
    expect(result.output).toContain("--require-clean")
  })

  it("documents BYOK env vars in help examples", () => {
    const result = run("ingest --help")
    expect(result.output).toContain("ANTHROPIC_API_KEY")
    expect(result.output).toContain("OPENAI_API_KEY")
    expect(result.output).toContain("AI_GATEWAY_API_KEY")
  })

  it("--dry-run on a repo with no eligible files errors with E_CONTEXT_NO_SOURCES", () => {
    // Empty temp dir has nothing to walk → helpful error, not a crash.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-ing-empty-"))
    try {
      const result = run(`ingest ${tmp} --dry-run`)
      // No sources available; even --dry-run goes through the walker.
      expect(result.exitCode).toBe(1)
      expect(result.output).toContain("E_CONTEXT_NO_SOURCES")
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it("no auth + no BYOK on a real repo surfaces E_AUTH_REQUIRED", () => {
    // Create a minimal repo the walker likes.
    // With the hosted-proxy default, running ingest without a helpbase session
    // AND without AI_GATEWAY_API_KEY in non-TTY mode returns E_AUTH_REQUIRED
    // (the inline-login prompt can only fire on a real TTY). Interactive
    // users on a TTY get the login prompt instead.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-ing-nokey-"))
    try {
      fs.writeFileSync(path.join(tmp, "README.md"), "# Hello\n\nsample repo for test")
      const result = runWithEnv(`ingest ${tmp}`, {
        AI_GATEWAY_API_KEY: "",
        ANTHROPIC_API_KEY: "",
        OPENAI_API_KEY: "",
        HELPBASE_TOKEN: "",
      })
      expect(result.exitCode).toBe(1)
      expect(result.output).toContain("E_AUTH_REQUIRED")
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it("invalid repo path surfaces E_CONTEXT_REPO_PATH", () => {
    const result = run("ingest /tmp/helpbase-does-not-exist-ing-test")
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain("E_CONTEXT_REPO_PATH")
  })

  it("rejects negative --max-tokens instead of silently falling back", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-ing-budget-"))
    try {
      fs.writeFileSync(path.join(tmp, "README.md"), "# Hello\n\nsample repo")
      // Negative --max-tokens used to coerce to 100_000 via `parseInt(x) || default`,
      // which also left the `maxTokens > 0` gate inside generateHowtosFromRepo
      // bypassed if the caller actually passed a negative number at runtime.
      const result = runWithEnv(`ingest ${tmp} --max-tokens -1 --dry-run`, {
        AI_GATEWAY_API_KEY: "",
        ANTHROPIC_API_KEY: "",
        OPENAI_API_KEY: "",
      })
      expect(result.exitCode).toBe(1)
      expect(result.output).toContain("E_CONTEXT_INVALID_BUDGET")
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it("rejects zero --chars-per-token (would trivially make the estimate 0)", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-ing-chars-"))
    try {
      fs.writeFileSync(path.join(tmp, "README.md"), "# Hello\n\nsample repo")
      const result = runWithEnv(`ingest ${tmp} --chars-per-token 0 --dry-run`, {
        AI_GATEWAY_API_KEY: "",
        ANTHROPIC_API_KEY: "",
        OPENAI_API_KEY: "",
      })
      expect(result.exitCode).toBe(1)
      expect(result.output).toContain("E_CONTEXT_INVALID_BUDGET")
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it("accepts --max-tokens 0 as a gate-disable (documented behavior)", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-ing-zero-"))
    try {
      fs.writeFileSync(path.join(tmp, "README.md"), "# Hello\n\nsample repo")
      // 0 disables the budget gate entirely per the flag's contract.
      // --dry-run skips the LLM call so we can exercise parseBudgetInt
      // without a real key.
      const result = runWithEnv(`ingest ${tmp} --max-tokens 0 --dry-run`, {
        AI_GATEWAY_API_KEY: "",
        ANTHROPIC_API_KEY: "",
        OPENAI_API_KEY: "",
      })
      expect(result.exitCode).toBe(0)
      expect(result.output).toContain("Dry run")
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it("aborts before LLM call on secret-shaped content in source files", () => {
    // Pre-LLM secret scan: a real key in a .ts file must abort the run
    // before buildContextPrompt or any LLM call — otherwise the secret
    // would leak into _prompt.txt under --debug or to the LLM gateway.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-ing-secret-"))
    try {
      fs.writeFileSync(path.join(tmp, "README.md"), "# Hello\n\nsample repo")
      // Use a credential-assignment pattern that matches SECRET_CONTENT_PATTERNS
      // without being a real key (the pattern only needs 10+ non-ws chars).
      fs.writeFileSync(
        path.join(tmp, "config.ts"),
        'export const ANTHROPIC_API_KEY = "sk-ant-fake1234567890abcdef"\n',
      )
      const result = runWithEnv(`ingest ${tmp} --dry-run`, {
        AI_GATEWAY_API_KEY: "",
        ANTHROPIC_API_KEY: "",
        OPENAI_API_KEY: "",
      })
      expect(result.exitCode).toBe(1)
      expect(result.output).toContain("E_CONTEXT_SECRET_SOURCE")
      // Exact line number + pattern name, never the secret bytes.
      expect(result.output).toContain("sk-api-key")
      expect(result.output).not.toContain("sk-ant-fake1234567890abcdef")
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it("--dry-run on a real repo prints a plan without an LLM call", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-ing-dry-"))
    try {
      fs.writeFileSync(path.join(tmp, "README.md"), "# Hello\n\nsample repo for test")
      fs.writeFileSync(path.join(tmp, "index.ts"), "export const one = 1")
      // Dry-run does not need a key.
      const result = runWithEnv(`ingest ${tmp} --dry-run`, {
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
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-ing-reuse-"))
    try {
      fs.writeFileSync(path.join(tmp, "README.md"), "# Hello\n\nsample")
      const result = run(`ingest ${tmp} --reuse-existing`)
      expect(result.exitCode).toBe(1)
      expect(result.output).toContain("E_CONTEXT_REUSE_WITHOUT_ASK")
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it("--reuse-existing --ask with empty .helpbase surfaces E_CONTEXT_REUSE_EMPTY", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-ing-reuse-"))
    try {
      fs.writeFileSync(path.join(tmp, "README.md"), "# Hello\n\nsample")
      // No .helpbase/docs directory exists — reuse should fail loudly.
      const result = run(`ingest ${tmp} --reuse-existing --ask "anything"`)
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
    const { resolveProjectName } = await import("../src/commands/ingest.js")
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
    const { resolveProjectName } = await import("../src/commands/ingest.js")
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-noname-"))
    try {
      fs.writeFileSync(path.join(tmp, "package.json"), JSON.stringify({ version: "0.1.0" }))
      expect(resolveProjectName(tmp)).toBe(path.basename(tmp))
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it("falls back to the directory basename when there is no package.json at all", async () => {
    const { resolveProjectName } = await import("../src/commands/ingest.js")
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-nopkg-"))
    try {
      expect(resolveProjectName(tmp)).toBe(path.basename(tmp))
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it("--reuse-existing --ask with a populated .helpbase/docs reaches the LLM call (fast path, no walk)", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-ing-reuse-"))
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
        `ingest ${tmp} --reuse-existing --ask "how do I log in?"`,
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

describe("ingest/context option surface parity", () => {
  it("applyIngestOptions produces byte-identical option flags on both commands", async () => {
    // Drift guard: if a future dev adds a .option(...) directly to
    // `ingestCommand` at the declaration site (instead of inside
    // applyIngestOptions), the new flag silently missing on `context` would
    // only surface as a user running `helpbase context --new-flag` and
    // hitting Commander's "unknown option" error. Introspect both Command
    // instances here so the drift is a test failure, not a user report.
    const { ingestCommand } = await import("../src/commands/ingest.js")
    const { contextCommand } = await import("../src/commands/context.js")

    const flagsOf = (cmd: { options: Array<{ flags: string }> }) =>
      cmd.options.map((o) => o.flags).sort()
    const argsOf = (cmd: { _args: Array<{ _name: string; required: boolean; defaultValue: unknown }> }) =>
      cmd._args.map((a) => ({ name: a._name, required: a.required, def: a.defaultValue }))

    expect(flagsOf(ingestCommand)).toEqual(flagsOf(contextCommand))
    expect(argsOf(ingestCommand as unknown as { _args: Array<{ _name: string; required: boolean; defaultValue: unknown }> })).toEqual(
      argsOf(contextCommand as unknown as { _args: Array<{ _name: string; required: boolean; defaultValue: unknown }> }),
    )
  })
})

// TODO(v0.7): delete this entire describe block together with
// packages/cli/src/commands/context.ts and the `addCommand(contextCommand)`
// line in packages/cli/src/index.ts.
describe("helpbase context (deprecated alias)", () => {
  it("--help still works and flags the command as deprecated", () => {
    const result = run("context --help")
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain("deprecated")
    expect(result.output).toContain("helpbase ingest")
    // Option surface is mirrored via applyIngestOptions — spot-check a few.
    expect(result.output).toContain("--max-tokens")
    expect(result.output).toContain("--ask")
    expect(result.output).toContain("--require-clean")
  })

  it("prints the deprecation warning to stderr on run", () => {
    // An invalid repo path triggers the error path — we only care that the
    // deprecation warning fires at all, which happens before any action.
    const result = run(`context /tmp/definitely-not-a-real-path-ctx-depr-test`)
    expect(result.output).toContain("helpbase context is deprecated")
    expect(result.output).toContain("helpbase ingest")
  })

  it("deprecation warning suppressed under --quiet", () => {
    const result = run("context --quiet /tmp/definitely-not-a-real-path-ctx-quiet-test")
    expect(result.output).not.toContain("helpbase context is deprecated")
  })

  it("deprecation warning suppressed under --json (pipes should stay clean)", () => {
    // Mirror of the --quiet test — the shim's emitDeprecationWarning honors
    // both flags. A refactor that drops one check would pollute JSON stdin
    // for downstream consumers.
    const result = run("context --json /tmp/definitely-not-a-real-path-ctx-json-test")
    expect(result.output).not.toContain("helpbase context is deprecated")
  })

  it("forwards to the same pipeline — --dry-run works identically", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-ctx-dry-"))
    try {
      fs.writeFileSync(path.join(tmp, "README.md"), "# Hello\n\nsample repo for test")
      const result = runWithEnv(`context ${tmp} --dry-run`, {
        AI_GATEWAY_API_KEY: "",
        ANTHROPIC_API_KEY: "",
        OPENAI_API_KEY: "",
      })
      expect(result.exitCode).toBe(0)
      expect(result.output).toContain("Dry run")
      expect(result.output).toContain("Sources found:")
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
