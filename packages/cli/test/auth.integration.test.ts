import { describe, it, expect } from "vitest"
import path from "node:path"
import { execSync } from "node:child_process"

/**
 * End-to-end auth integration test against the real Supabase project.
 *
 * Skipped unless SUPABASE_SERVICE_ROLE_KEY is set — CI and contributors
 * without secrets run the rest of the suite unaffected. Locally:
 *
 *   export SUPABASE_SERVICE_ROLE_KEY=<from Supabase dashboard>
 *   pnpm test
 *
 * This mints a real user JWT via the admin API (no email sent) and exercises
 * the CLI's token-resolution + RLS-backed queries.
 */

const CLI = path.resolve(__dirname, "../dist/index.js")
const MINT_SCRIPT = path.resolve(__dirname, "../scripts/mint-test-token.mjs")

const haveServiceKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
const describeIf = haveServiceKey ? describe : describe.skip

function mintToken(): string {
  return execSync(`node ${MINT_SCRIPT}`, {
    encoding: "utf-8",
    env: process.env,
  }).trim()
}

function execCli(
  args: string,
  env: Record<string, string | undefined> = {},
): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`node ${CLI} ${args}`, {
      encoding: "utf-8",
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    })
    return { stdout, stderr: "", exitCode: 0 }
  } catch (err: any) {
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      exitCode: err.status ?? 1,
    }
  }
}

describeIf("CLI auth against real Supabase (requires SUPABASE_SERVICE_ROLE_KEY)", () => {
  it("mints a valid token the CLI accepts via HELPBASE_TOKEN", () => {
    const token = mintToken()
    expect(token).toMatch(/^ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)

    const { stdout, exitCode } = execCli("whoami --format json", {
      HELPBASE_TOKEN: token,
    })

    expect(exitCode).toBe(0)
    const parsed = JSON.parse(stdout)
    expect(parsed.loggedIn).toBe(true)
    expect(parsed.email).toMatch(/@/)
    expect(parsed.source).toBe("HELPBASE_TOKEN")
  }, 30_000)

  it("rejects a malformed token", () => {
    const { stdout, exitCode } = execCli("whoami --format json", {
      HELPBASE_TOKEN: "not.a.real.token",
    })
    expect(exitCode).toBe(1)
    const parsed = JSON.parse(stdout)
    expect(parsed.loggedIn).toBe(false)
    expect(parsed.error).toMatch(/HELPBASE_TOKEN/)
  })

  it("text-mode whoami with valid token prints email + source", () => {
    const token = mintToken()
    const { stdout, exitCode } = execCli("whoami", { HELPBASE_TOKEN: token })
    expect(exitCode).toBe(0)
    expect(stdout).toContain("Email:")
    expect(stdout).toContain("Source:")
    expect(stdout).toContain("HELPBASE_TOKEN")
  }, 30_000)
})
