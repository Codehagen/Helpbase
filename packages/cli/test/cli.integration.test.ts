import { describe, it, expect } from "vitest"
import path from "node:path"
import { execSync } from "node:child_process"

const CLI = path.resolve(__dirname, "../dist/index.js")

function exec(args: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`node ${CLI} ${args}`, {
      encoding: "utf-8",
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

describe("helpbase CLI integration", () => {
  describe("--help and --version", () => {
    it("prints help with all commands listed", () => {
      const { stdout } = exec("--help")
      expect(stdout).toContain("dev")
      expect(stdout).toContain("generate")
      expect(stdout).toContain("audit")
      expect(stdout).toContain("new")
      expect(stdout).toContain("deploy")
      expect(stdout).toContain("login")
      expect(stdout).toContain("logout")
      expect(stdout).toContain("whoami")
      expect(stdout).toContain("link")
      expect(stdout).toContain("open")
      expect(stdout).toContain("feedback")
      expect(stdout).toContain("doctor")
    })

    it("prints version", () => {
      const { stdout } = exec("--version")
      expect(stdout.trim()).toBe("0.0.1")
    })

    it("each subcommand has help text", () => {
      for (const cmd of [
        "dev", "generate", "context", "sync", "mcp", "audit", "new", "deploy",
        "login", "logout", "whoami", "link", "open", "feedback", "doctor",
      ]) {
        const { stdout } = exec(`${cmd} --help`)
        expect(stdout.length).toBeGreaterThan(20)
      }
    }, 30_000)
  })

  describe("generate error handling", () => {
    it("exits 1 when no source is provided", () => {
      const result = exec("generate")
      expect(result.exitCode).toBe(1)
    })

    it("error output tells the user what to do", () => {
      const result = exec("generate")
      const output = result.stdout + result.stderr
      expect(output).toContain("--url")
      expect(output).toContain("--repo")
    })

    it("exits 1 for unreachable URL", () => {
      const result = exec("generate --url http://localhost:99999")
      expect(result.exitCode).toBe(1)
    })

    it("error for bad URL follows problem/cause/fix pattern", () => {
      const result = exec("generate --url http://localhost:99999")
      const output = result.stdout + result.stderr
      expect(output).toContain("Reason:")
      expect(output).toContain("Fix:")
      expect(output).toContain("Docs:")
    })
  })

  describe("audit integration", () => {
    it("exits 0 on valid content directory", () => {
      const contentDir = path.resolve(__dirname, "../../../apps/web/content")
      const result = exec(`audit --dir ${contentDir}`)
      expect(result.exitCode).toBe(0)
    })

    it("exits 1 on nonexistent directory", () => {
      const result = exec("audit --dir /tmp/helpbase-nonexistent-dir-12345")
      expect(result.exitCode).toBe(1)
    })
  })
})
