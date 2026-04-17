import { canColor, isJsonMode, isQuiet } from "./tty.js"

/**
 * ANSI-Shadow rendering of "HELPBASE" with a top-to-bottom grayscale gradient.
 *
 * Each line is 64 display columns. Skip when the terminal is narrower so we
 * don't wrap into garbage, and skip under --json/--quiet so composable output
 * stays clean. Without color (NO_COLOR, piped stdout) we emit the glyphs
 * without SGR so the shape still comes through.
 */

const LOGO_LINES = [
  "██╗  ██╗███████╗██╗     ██████╗ ██████╗  █████╗ ███████╗███████╗",
  "██║  ██║██╔════╝██║     ██╔══██╗██╔══██╗██╔══██╗██╔════╝██╔════╝",
  "███████║█████╗  ██║     ██████╔╝██████╔╝███████║███████╗█████╗  ",
  "██╔══██║██╔══╝  ██║     ██╔═══╝ ██╔══██╗██╔══██║╚════██║██╔══╝  ",
  "██║  ██║███████╗███████╗██║     ██████╔╝██║  ██║███████║███████╗",
  "╚═╝  ╚═╝╚══════╝╚══════╝╚═╝     ╚═════╝ ╚═╝  ╚═╝╚══════╝╚══════╝",
]

const LOGO_WIDTH = 64

// 256-color grays, lightest at top. Readable on both light and dark terminals.
const GRAYS = [
  "\x1b[38;5;250m",
  "\x1b[38;5;248m",
  "\x1b[38;5;245m",
  "\x1b[38;5;243m",
  "\x1b[38;5;240m",
  "\x1b[38;5;238m",
]
const RESET = "\x1b[0m"

export function renderBanner(): string {
  if (isJsonMode() || isQuiet()) return ""
  const cols = process.stdout.columns ?? 80
  if (cols < LOGO_WIDTH + 2) return ""
  if (!canColor()) return LOGO_LINES.join("\n") + "\n"
  return LOGO_LINES.map((line, i) => `${GRAYS[i]}${line}${RESET}`).join("\n") + "\n"
}
