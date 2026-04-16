import { describe, it, expect } from "vitest"
import {
  isSecretFile,
  whichSecretFilePattern,
  scanForSecrets,
  formatSecretError,
} from "../secrets.js"

describe("isSecretFile", () => {
  it.each([
    [".env", true, "dotenv"],
    [".env.local", true, "dotenv"],
    [".env.production", true, "dotenv"],
    ["foo.pem", true, "pem"],
    ["private.key", true, "key"],
    ["cert.p12", true, "p12"],
    ["bundle.pfx", true, "pfx"],
    ["id_rsa", true, "id_rsa"],
    ["id_ed25519", true, "id_rsa"],
    // negatives
    ["README.md", false, null],
    ["package.json", false, null],
    ["keynote.md", false, null],
    ["env.example.md", false, null],
    ["envelope.ts", false, null],
  ])("(%s) → %s (%s)", (name, expected, expectedPattern) => {
    expect(isSecretFile(name)).toBe(expected)
    expect(whichSecretFilePattern(name)).toBe(expectedPattern)
  })

  it("ignores directory prefix and handles both slash styles", () => {
    expect(isSecretFile("src/config/.env.local")).toBe(true)
    expect(isSecretFile("src\\config\\.env.local")).toBe(true)
    expect(isSecretFile("src/foo.pem")).toBe(true)
  })
})

describe("scanForSecrets", () => {
  it("returns empty array for clean content", () => {
    expect(scanForSecrets("# Hello world\nJust docs here.")).toEqual([])
    expect(scanForSecrets("")).toEqual([])
  })

  it("catches Anthropic/OpenAI-shaped sk- keys", () => {
    const m = scanForSecrets("const key = 'sk-abcdefghijklmnopqrstuvwxyz123'")
    expect(m).toHaveLength(1)
    expect(m[0]!.patternName).toBe("sk-api-key")
    expect(m[0]!.lineNo).toBe(1)
  })

  it("catches AWS access keys", () => {
    const m = scanForSecrets("AKIAIOSFODNN7EXAMPLE")
    expect(m[0]!.patternName).toBe("aws-access-key")
  })

  it("catches GitHub PATs", () => {
    const m = scanForSecrets("token: ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
    expect(m[0]!.patternName).toBe("github-pat")
  })

  it("catches Slack bot tokens", () => {
    const m = scanForSecrets("xoxb-123-456-abcdefghijklmnop")
    expect(m[0]!.patternName).toBe("slack-bot-token")
  })

  it("catches env-var assignments with non-empty values", () => {
    const m = scanForSecrets(`ANTHROPIC_API_KEY=sk-ant-api03-abcdefghijklmnop`)
    // The content has both a sk- match AND an ANTHROPIC_API_KEY= match — both should fire.
    const names = m.map((x) => x.patternName)
    expect(names).toContain("anthropic-key-assignment")
    expect(names).toContain("sk-api-key")
  })

  it("does NOT fire on empty env-var assignments", () => {
    const m = scanForSecrets(`ANTHROPIC_API_KEY=\nOPENAI_API_KEY=""`)
    // The regex requires at least 10 chars of value; short/empty assignments are fine
    // in example/template .env files.
    expect(m).toEqual([])
  })

  it("catches PEM private key blocks", () => {
    const m = scanForSecrets("-----BEGIN RSA PRIVATE KEY-----\n...")
    expect(m[0]!.patternName).toBe("private-key-pem")
  })

  it("reports 1-indexed line numbers correctly", () => {
    const text = ["", "", "", "AKIAIOSFODNN7EXAMPLE"].join("\n")
    const m = scanForSecrets(text)
    expect(m[0]!.lineNo).toBe(4)
  })

  it("SECURITY: Match objects never contain the matched substring", () => {
    const secret = "sk-ant-REAL_LEAKED_KEY_VALUE_ABCDEF123"
    const m = scanForSecrets(`const x = '${secret}'`)
    expect(m).toHaveLength(1)
    // Exhaustive key check: the object keys are the public shape, so ensure
    // no property (including via JSON.stringify of the whole array) contains
    // the matched bytes.
    const serialized = JSON.stringify(m)
    expect(serialized).not.toContain(secret)
    expect(serialized).not.toContain("REAL_LEAKED_KEY")
  })
})

describe("formatSecretError", () => {
  it("includes file path, pattern name, line number — never the match", () => {
    const secret = "sk-ant-REAL_LEAKED_KEY_VALUE_ABCDEF123"
    const matches = scanForSecrets(`x = '${secret}'`)
    const msg = formatSecretError(matches, ".helpbase/docs/foo/bar.mdx")
    expect(msg).toContain(".helpbase/docs/foo/bar.mdx")
    expect(msg).toContain("sk-api-key")
    expect(msg).toContain("line 1")
    // The secret must not appear in the error
    expect(msg).not.toContain(secret)
    expect(msg).not.toContain("REAL_LEAKED_KEY")
    // Suggests remediation
    expect(msg).toMatch(/gitignore|remove|inspect/i)
  })

  it("handles multiple matches", () => {
    const text = "AKIAIOSFODNN7EXAMPLE\nghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    const msg = formatSecretError(scanForSecrets(text), "inline.md")
    expect(msg).toContain("aws-access-key")
    expect(msg).toContain("github-pat")
    expect(msg).toContain("line 1")
    expect(msg).toContain("line 2")
  })
})
