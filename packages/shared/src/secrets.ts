/**
 * Secret deny-list — two-gate defense for helpbase context ingestion.
 *
 * Gate 1: `isSecretFile(relPath)` — called by walkers to skip files whose
 * NAMES indicate secrets (.env*, *.pem, *.key, etc.). These files are
 * excluded from the LLM context entirely.
 *
 * Gate 2: `scanForSecrets(text)` — called on the FINAL MDX output before
 * any disk write. Matches against content patterns (API key shapes, PEM
 * headers, etc.). A hit aborts the run without any partial file writes.
 *
 * Security invariant: `Match` and `formatSecretError` must NEVER contain
 * the matched substring. Only the pattern name + line number. This keeps
 * CI logs, shell history, and screen recordings clean if a scan fires.
 * The caller reads the file themselves if they need to see what matched.
 */

/** Filename glob patterns that indicate a secret file. */
const SECRET_FILE_GLOBS: Array<{ name: string; test: (basename: string) => boolean }> = [
  { name: "dotenv", test: (b) => b === ".env" || b.startsWith(".env.") },
  { name: "pem", test: (b) => b.endsWith(".pem") },
  { name: "key", test: (b) => b.endsWith(".key") },
  { name: "p12", test: (b) => b.endsWith(".p12") },
  { name: "pfx", test: (b) => b.endsWith(".pfx") },
  { name: "id_rsa", test: (b) => b === "id_rsa" || b === "id_ed25519" || b === "id_dsa" },
]

/**
 * Content patterns — regexes that match known secret shapes inside file
 * contents. Keep these tight: a false positive blocks a legitimate run.
 */
interface ContentPattern {
  name: string
  pattern: RegExp
}

const SECRET_CONTENT_PATTERNS: ContentPattern[] = [
  // Anthropic-style keys (sk-ant-...), OpenAI (sk-...), generic "sk-" keys
  { name: "sk-api-key", pattern: /sk-[A-Za-z0-9-_]{20,}/g },
  // AWS Access Key ID
  { name: "aws-access-key", pattern: /AKIA[0-9A-Z]{16}/g },
  // Slack bot token
  { name: "slack-bot-token", pattern: /xoxb-[0-9]+-[0-9]+-[A-Za-z0-9]+/g },
  // GitHub personal access token
  { name: "github-pat", pattern: /ghp_[A-Za-z0-9]{36,}/g },
  // GitHub fine-grained PAT
  { name: "github-fine-pat", pattern: /github_pat_[A-Za-z0-9_]{40,}/g },
  // Assignment of well-known secret env vars with non-empty values.
  // [ \t]* (not \s*) keeps the match on one line so `FOO=\nBAR=val` cannot
  // accidentally consume `BAR=val` as FOO's value.
  {
    name: "anthropic-key-assignment",
    pattern: /\bANTHROPIC_API_KEY[ \t]*=[ \t]*[^\s"']{10,}/g,
  },
  {
    name: "openai-key-assignment",
    pattern: /\bOPENAI_API_KEY[ \t]*=[ \t]*[^\s"']{10,}/g,
  },
  {
    name: "aws-secret-assignment",
    pattern: /\bAWS_SECRET_ACCESS_KEY[ \t]*=[ \t]*[^\s"']{10,}/g,
  },
  // PEM private key block marker
  { name: "private-key-pem", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
]

export interface SecretFilePatternMatch {
  patternName: string
}

/**
 * Check whether a file should be excluded from LLM context because its
 * name indicates a secret. Accepts either a basename or a full/relative
 * path; only the final path segment is inspected.
 */
export function isSecretFile(filePath: string): boolean {
  const basename = filePath.split(/[\\/]/).pop() ?? filePath
  for (const g of SECRET_FILE_GLOBS) {
    if (g.test(basename.toLowerCase())) return true
  }
  return false
}

/**
 * Like `isSecretFile` but returns the matching pattern name, or null.
 * Useful when a caller wants to tell the user *why* a file was skipped
 * without leaking the file's contents.
 */
export function whichSecretFilePattern(filePath: string): string | null {
  const basename = (filePath.split(/[\\/]/).pop() ?? filePath).toLowerCase()
  for (const g of SECRET_FILE_GLOBS) {
    if (g.test(basename)) return g.name
  }
  return null
}

export interface SecretContentMatch {
  /** The name of the pattern that fired (e.g. "aws-access-key"). */
  patternName: string
  /** 1-indexed line number in the scanned text where the match starts. */
  lineNo: number
}

/**
 * Scan a block of text for content-level secret patterns.
 *
 * SECURITY: the returned `SecretContentMatch` objects deliberately do
 * NOT include the matched substring. Leaking the matched bytes into a
 * log / terminal / stack trace is exactly what this module exists to
 * prevent. If a caller needs to *see* the secret to remediate, they can
 * re-read the file themselves.
 */
export function scanForSecrets(text: string): SecretContentMatch[] {
  if (!text) return []
  const matches: SecretContentMatch[] = []
  // Pre-compute line starts so we can map match-index → line number
  // without allocating an O(matches * lines) re-scan per hit.
  const lineStarts: number[] = [0]
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10 /* \n */) lineStarts.push(i + 1)
  }
  function lineForIndex(idx: number): number {
    // Binary search lineStarts for the greatest entry <= idx, return 1-indexed.
    let lo = 0
    let hi = lineStarts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1
      if (lineStarts[mid]! <= idx) lo = mid
      else hi = mid - 1
    }
    return lo + 1
  }
  for (const p of SECRET_CONTENT_PATTERNS) {
    // Reset global-regex lastIndex before iteration; don't mutate the shared object.
    const rx = new RegExp(p.pattern.source, p.pattern.flags)
    let m: RegExpExecArray | null
    while ((m = rx.exec(text)) !== null) {
      matches.push({ patternName: p.name, lineNo: lineForIndex(m.index) })
      // If pattern isn't global, break to avoid infinite loop.
      if (!rx.global) break
    }
  }
  return matches
}

/**
 * Format a user-facing error message describing secret scan hits.
 * Contains file path + pattern names + line numbers only. NEVER
 * includes the matched bytes.
 */
export function formatSecretError(
  matches: SecretContentMatch[],
  filePath: string,
): string {
  if (matches.length === 0) {
    return `No secret patterns matched in ${filePath} (this should not produce an error).`
  }
  const lines = matches
    .map((m) => `  - line ${m.lineNo}: ${m.patternName}`)
    .join("\n")
  return (
    `Secret-shaped content detected in ${filePath}:\n${lines}\n` +
    `\nThe run was aborted before any .helpbase/ write. Inspect the file, ` +
    `remove or gitignore the secret source, and re-run helpbase context.`
  )
}
