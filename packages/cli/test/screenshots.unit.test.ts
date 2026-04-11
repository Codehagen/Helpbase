import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import {
  readScreenshotsDir,
  readCaptions,
  validateMagicBytes,
  MAX_SCREENSHOTS,
} from "@workspace/shared/screenshots"

// ── Test fixtures ──────────────────────────────────────────────────

/** Minimal valid PNG (1x1 pixel, red) */
const TINY_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d494844520000000100000001" +
    "0802000000907753de0000000c4944415478da6260f80f" +
    "0000010100009a3661ce0000000049454e44ae426082",
  "hex",
)

/** Minimal valid JPEG header */
const TINY_JPG = Buffer.from(
  "ffd8ffe000104a46494600010100000100010000",
  "hex",
)

/** Minimal valid WebP header (RIFF + WEBP) */
const TINY_WEBP = Buffer.from(
  "524946462400000057454250565038200000000030010009d32d00",
  "hex",
)

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "helpbase-test-"))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

// ── validateMagicBytes ─────────────────────────────────────────────

describe("validateMagicBytes", () => {
  it("detects valid PNG", () => {
    expect(validateMagicBytes(TINY_PNG)).toBe("png")
  })

  it("detects valid JPG", () => {
    expect(validateMagicBytes(TINY_JPG)).toBe("jpg")
  })

  it("detects valid WebP", () => {
    expect(validateMagicBytes(TINY_WEBP)).toBe("webp")
  })

  it("returns null for a text file", () => {
    const textBuffer = Buffer.from("Hello, this is a text file")
    expect(validateMagicBytes(textBuffer)).toBeNull()
  })

  it("returns null for an empty buffer", () => {
    expect(validateMagicBytes(Buffer.alloc(0))).toBeNull()
  })

  it("returns null for a PDF", () => {
    const pdf = Buffer.from("%PDF-1.4", "ascii")
    expect(validateMagicBytes(pdf)).toBeNull()
  })
})

// ── readScreenshotsDir ─────────────────────────────────────────────

describe("readScreenshotsDir", () => {
  it("reads and sorts numbered PNG files", () => {
    fs.writeFileSync(path.join(tmpDir, "02-settings.png"), TINY_PNG)
    fs.writeFileSync(path.join(tmpDir, "01-dashboard.png"), TINY_PNG)
    fs.writeFileSync(path.join(tmpDir, "03-confirm.png"), TINY_PNG)

    const files = readScreenshotsDir(tmpDir)
    expect(files).toHaveLength(3)
    expect(files[0]!.filename).toBe("01-dashboard.png")
    expect(files[1]!.filename).toBe("02-settings.png")
    expect(files[2]!.filename).toBe("03-confirm.png")
    expect(files[0]!.order).toBe(1)
    expect(files[1]!.order).toBe(2)
    expect(files[2]!.order).toBe(3)
  })

  it("detects the correct MIME type", () => {
    fs.writeFileSync(path.join(tmpDir, "01-shot.png"), TINY_PNG)
    fs.writeFileSync(path.join(tmpDir, "02-shot.jpg"), TINY_JPG)

    const files = readScreenshotsDir(tmpDir)
    expect(files[0]!.mimeType).toBe("image/png")
    expect(files[1]!.mimeType).toBe("image/jpeg")
  })

  it("throws when directory does not exist", () => {
    expect(() => readScreenshotsDir("/nonexistent/path")).toThrow(
      /not found/i,
    )
  })

  it("throws when directory has no image files", () => {
    fs.writeFileSync(path.join(tmpDir, "notes.txt"), "hello")
    expect(() => readScreenshotsDir(tmpDir)).toThrow(/no image files/i)
  })

  it("throws when non-image file has image extension", () => {
    // Write a text file with .png extension
    fs.writeFileSync(
      path.join(tmpDir, "01-fake.png"),
      Buffer.from("not a real image"),
    )
    expect(() => readScreenshotsDir(tmpDir)).toThrow(/not a valid image/i)
  })

  it(`throws when more than ${MAX_SCREENSHOTS} screenshots`, () => {
    for (let i = 1; i <= MAX_SCREENSHOTS + 1; i++) {
      const name = `${String(i).padStart(2, "0")}-shot.png`
      fs.writeFileSync(path.join(tmpDir, name), TINY_PNG)
    }
    expect(() => readScreenshotsDir(tmpDir)).toThrow(/too many screenshots/i)
  })

  it("sorts alphabetically when files lack numeric prefix", () => {
    fs.writeFileSync(path.join(tmpDir, "settings.png"), TINY_PNG)
    fs.writeFileSync(path.join(tmpDir, "billing.png"), TINY_PNG)
    fs.writeFileSync(path.join(tmpDir, "dashboard.png"), TINY_PNG)

    const files = readScreenshotsDir(tmpDir)
    expect(files[0]!.filename).toBe("billing.png")
    expect(files[1]!.filename).toBe("dashboard.png")
    expect(files[2]!.filename).toBe("settings.png")
    // Orders should be 1-indexed after sort
    expect(files[0]!.order).toBe(1)
    expect(files[1]!.order).toBe(2)
    expect(files[2]!.order).toBe(3)
  })

  it("ignores non-image files in the directory", () => {
    fs.writeFileSync(path.join(tmpDir, "01-shot.png"), TINY_PNG)
    fs.writeFileSync(path.join(tmpDir, "captions.json"), '{}')
    fs.writeFileSync(path.join(tmpDir, "notes.txt"), "hello")

    const files = readScreenshotsDir(tmpDir)
    expect(files).toHaveLength(1)
    expect(files[0]!.filename).toBe("01-shot.png")
  })
})

// ── readCaptions ───────────────────────────────────────────────────

describe("readCaptions", () => {
  it("returns empty object when captions.json does not exist", () => {
    const result = readCaptions(tmpDir)
    expect(result).toEqual({})
  })

  it("parses valid captions.json", () => {
    fs.writeFileSync(
      path.join(tmpDir, "captions.json"),
      JSON.stringify({
        "01-dashboard.png": "Click the settings gear",
        "02-settings.png": "Toggle the billing option",
      }),
    )

    const result = readCaptions(tmpDir)
    expect(result["01-dashboard.png"]).toBe("Click the settings gear")
    expect(result["02-settings.png"]).toBe("Toggle the billing option")
  })

  it("throws on malformed JSON", () => {
    fs.writeFileSync(path.join(tmpDir, "captions.json"), "not json{{{")
    expect(() => readCaptions(tmpDir)).toThrow(/not valid JSON/i)
  })

  it("throws when captions.json is an array instead of object", () => {
    fs.writeFileSync(
      path.join(tmpDir, "captions.json"),
      JSON.stringify(["not", "an", "object"]),
    )
    expect(() => readCaptions(tmpDir)).toThrow(/not valid JSON/i)
  })
})
