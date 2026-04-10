import { describe, it, expect } from "vitest"
import { frontmatterSchema } from "@workspace/shared/schemas"

describe("videoEmbed allowlist", () => {
  const base = {
    schemaVersion: 1,
    title: "Test",
    description: "Test description",
  }

  it("accepts youtube.com embeds", () => {
    const result = frontmatterSchema.safeParse({
      ...base,
      videoEmbed: "https://www.youtube.com/embed/abc123",
    })
    expect(result.success).toBe(true)
  })

  it("accepts loom.com embeds", () => {
    const result = frontmatterSchema.safeParse({
      ...base,
      videoEmbed: "https://www.loom.com/share/abc123",
    })
    expect(result.success).toBe(true)
  })

  it("rejects unknown hosts", () => {
    const result = frontmatterSchema.safeParse({
      ...base,
      videoEmbed: "https://evil.com/phish",
    })
    expect(result.success).toBe(false)
  })

  it("rejects javascript: URLs", () => {
    const result = frontmatterSchema.safeParse({
      ...base,
      videoEmbed: "javascript:alert(1)",
    })
    expect(result.success).toBe(false)
  })
})
