import fs from "node:fs"
import path from "node:path"

/**
 * Screenshot file I/O for the visual generation pipeline.
 *
 * Handles: reading + validating screenshot directories, optional captions,
 * magic byte validation, and image resizing via optional sharp peer dep.
 */

// ── Constants ──────────────────────────────────────────────────────

/** Maximum screenshots per generation run (Gemini 20MB inline limit). */
export const MAX_SCREENSHOTS = 20

/** Maximum image size in bytes before sending to the model (~1MB). */
export const MAX_IMAGE_BYTES = 1_000_000

/** Maximum image width in pixels for resize. */
export const MAX_IMAGE_WIDTH = 1920

/** Supported image extensions. */
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"])

// ── Magic bytes ────────────────────────────────────────────────────

const MAGIC_BYTES: Array<{ ext: string; bytes: number[]; offset?: number }> = [
  { ext: "png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { ext: "jpg", bytes: [0xff, 0xd8, 0xff] },
  { ext: "webp", bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 }, // RIFF header
]

/**
 * Validate that a buffer starts with known image magic bytes.
 * Returns the detected format or null if unrecognized.
 */
export function validateMagicBytes(
  buffer: Buffer,
): "png" | "jpg" | "webp" | null {
  for (const { ext, bytes, offset } of MAGIC_BYTES) {
    const start = offset ?? 0
    if (buffer.length < start + bytes.length) continue
    const match = bytes.every((b, i) => buffer[start + i] === b)
    if (match) {
      // WebP needs additional check: bytes 8-11 should be "WEBP"
      if (ext === "webp") {
        if (
          buffer.length >= 12 &&
          buffer[8] === 0x57 && // W
          buffer[9] === 0x45 && // E
          buffer[10] === 0x42 && // B
          buffer[11] === 0x50 // P
        ) {
          return "webp"
        }
        continue
      }
      return ext as "png" | "jpg"
    }
  }
  return null
}

// ── Types ──────────────────────────────────────────────────────────

export interface ScreenshotFile {
  /** Original filename, e.g. "01-dashboard.png" */
  filename: string
  /** Absolute path to the source file */
  sourcePath: string
  /** File contents as a Buffer */
  buffer: Buffer
  /** Detected MIME type */
  mimeType: string
  /** Numeric sort order (from prefix or inferred) */
  order: number
}

export interface CaptionsMap {
  [filename: string]: string
}

// ── Read screenshots directory ─────────────────────────────────────

/**
 * Read and validate a screenshots directory.
 * Files must be images (validated by magic bytes) with a numeric prefix.
 *
 * @throws Error if directory doesn't exist, is empty, has too many files,
 *         or contains non-image files.
 */
export function readScreenshotsDir(dir: string): ScreenshotFile[] {
  const absDir = path.resolve(dir)

  if (!fs.existsSync(absDir)) {
    throw new Error(
      `Screenshots directory not found: ${absDir}\n` +
        `  Fix: Create the directory and add numbered screenshot files (e.g. 01-dashboard.png)`,
    )
  }

  const entries = fs.readdirSync(absDir).filter((f) => {
    const ext = path.extname(f).toLowerCase()
    return IMAGE_EXTENSIONS.has(ext)
  })

  if (entries.length === 0) {
    throw new Error(
      `No image files found in ${absDir}\n` +
        `  Supported formats: PNG, JPG, WebP\n` +
        `  Fix: Add numbered screenshot files (e.g. 01-dashboard.png, 02-settings.png)`,
    )
  }

  if (entries.length > MAX_SCREENSHOTS) {
    throw new Error(
      `Too many screenshots (${entries.length}). Maximum ${MAX_SCREENSHOTS} per generation run.\n` +
        `  Fix: Split into multiple folders and run separately.`,
    )
  }

  const files: ScreenshotFile[] = []

  for (const filename of entries) {
    // Path traversal protection: reject symlinks or entries with path separators
    if (path.basename(filename) !== filename) {
      throw new Error(
        `Invalid filename: ${filename}\n` +
          `  Fix: Screenshot filenames must not contain path separators.`,
      )
    }

    const filePath = path.join(absDir, filename)
    const buffer = fs.readFileSync(filePath)

    // Magic byte validation
    const format = validateMagicBytes(buffer)
    if (!format) {
      throw new Error(
        `Not a valid image file: ${filename}\n` +
          `  The file extension suggests an image, but the file contents don't match.\n` +
          `  Fix: Ensure this is a real PNG, JPG, or WebP file.`,
      )
    }

    // Parse numeric prefix for ordering
    const prefixMatch = filename.match(/^(\d+)/)
    const order = prefixMatch ? parseInt(prefixMatch[1]!, 10) : -1

    const mimeMap: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      webp: "image/webp",
    }

    files.push({
      filename,
      sourcePath: filePath,
      buffer,
      mimeType: mimeMap[format]!,
      order,
    })
  }

  // Check numeric prefix consistency
  const withPrefix = files.filter((f) => f.order >= 0)
  const withoutPrefix = files.filter((f) => f.order < 0)

  if (withPrefix.length > 0 && withoutPrefix.length > 0) {
    const mixedNames = withoutPrefix.map((f) => f.filename).join(", ")
    throw new Error(
      `Mixed filename formats: some files have numeric prefixes and some don't.\n` +
        `  Files without prefix: ${mixedNames}\n` +
        `  Fix: Either add numeric prefixes to all files (e.g. 01-name.png) or remove them from all.`,
    )
  }

  if (withPrefix.length === files.length) {
    // Sort by numeric prefix
    files.sort((a, b) => a.order - b.order)
  } else {
    // Sort alphabetically (fallback for smart ordering later)
    files.sort((a, b) => a.filename.localeCompare(b.filename))
  }

  // Re-assign order based on sorted position (1-indexed)
  files.forEach((f, i) => {
    f.order = i + 1
  })

  return files
}

// ── Captions ───────────────────────────────────────────────────────

/**
 * Read optional captions.json from a screenshots directory.
 * Format: { "01-dashboard.png": "Click the invite button", ... }
 *
 * Returns an empty object if captions.json doesn't exist.
 * @throws Error if captions.json exists but is malformed JSON.
 */
export function readCaptions(dir: string): CaptionsMap {
  const captionsPath = path.join(path.resolve(dir), "captions.json")

  if (!fs.existsSync(captionsPath)) {
    return {}
  }

  const raw = fs.readFileSync(captionsPath, "utf-8")
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("Expected a JSON object")
    }
    return parsed as CaptionsMap
  } catch (err) {
    throw new Error(
      `captions.json is not valid JSON: ${err instanceof Error ? err.message : "parse error"}\n` +
        `  Fix: Check the file format. Expected: { "01-file.png": "caption text", ... }\n` +
        `  Or remove captions.json to let the AI describe screenshots automatically.`,
    )
  }
}

// ── Image resize ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _sharp: any | null | undefined

/**
 * Try to load sharp. Returns the module or null if not installed.
 * Caches the result so the dynamic import only runs once.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tryLoadSharp(): Promise<any | null> {
  if (_sharp !== undefined) return _sharp
  try {
    // Use a variable to prevent TypeScript from resolving the module at compile time
    const sharpModule = "sharp"
    const mod = await import(/* @vite-ignore */ sharpModule)
    _sharp = mod.default ?? mod
    return _sharp
  } catch {
    _sharp = null
    return null
  }
}

export interface ResizeResult {
  buffer: Buffer
  resized: boolean
  warning?: string
}

/**
 * Resize an image for model consumption.
 * - If sharp is installed: resize to max 1920px width, compress to <1MB
 * - If sharp is not installed: pass through with a warning if over 2MB
 *
 * @throws Error if the image is still >4MB after resize (Gemini limit)
 */
export async function resizeForModel(
  buffer: Buffer,
  filename: string,
): Promise<ResizeResult> {
  const sharp = await tryLoadSharp()

  if (!sharp) {
    // No sharp — hard limit at 4MB (Gemini per-image limit)
    if (buffer.length > 4_000_000) {
      throw new Error(
        `${filename} is ${(buffer.length / 1_000_000).toFixed(1)}MB (Gemini limit: 4MB).\n` +
          `  Fix: Install sharp for automatic resize (npm install sharp), or manually resize the image.`,
      )
    }
    if (buffer.length > 2_000_000) {
      return {
        buffer,
        resized: false,
        warning:
          `${filename} is ${(buffer.length / 1_000_000).toFixed(1)}MB. ` +
          `Install sharp for automatic resize: npm install sharp`,
      }
    }
    return { buffer, resized: false }
  }

  // Sharp is available — resize if needed
  if (buffer.length <= MAX_IMAGE_BYTES) {
    return { buffer, resized: false }
  }

  try {
    const resized = await sharp(buffer)
      .resize({ width: MAX_IMAGE_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer()

    if (resized.length > 4_000_000) {
      throw new Error(
        `${filename} is still ${(resized.length / 1_000_000).toFixed(1)}MB after resize (Gemini limit: 4MB).\n` +
          `  Fix: Manually resize the image to a smaller resolution.`,
      )
    }

    return { buffer: resized, resized: true }
  } catch (err) {
    if (err instanceof Error && err.message.includes("after resize")) throw err
    throw new Error(
      `Cannot process image ${filename}: ${err instanceof Error ? err.message : "unknown error"}\n` +
        `  Fix: Ensure the file is a valid image. Try re-saving it from an image editor.`,
    )
  }
}
