/**
 * RFC 9110 Accept header negotiation.
 *
 * Used by proxy.ts to route article requests to the HTML page or the
 * `/api/md/*` handler based on what the client asked for. Kept pure
 * (no Next imports) so the parser is unit-testable and reusable.
 *
 * Specificity rules matter. `text/html;q=0, *\/*;q=1` must reject
 * `text/html` even though the wildcard has higher q — the specific
 * range wins regardless of q. That's the acceptmarkdown.com compliance
 * gotcha the static-rewrite approach can't handle.
 */

export type AcceptEntry = {
  type: string       // e.g. "text"
  subtype: string    // e.g. "markdown" or "*"
  q: number          // 0..1
  specificity: number // 3 = type/subtype, 2 = type/*, 1 = *\/*
  order: number      // original position for stable tie-break
}

function parseEntry(raw: string, order: number): AcceptEntry | null {
  const parts = raw.split(";").map((p) => p.trim()).filter(Boolean)
  const mediaRange = parts[0]
  if (!mediaRange) return null

  const [type, subtype] = mediaRange.split("/").map((s) => s?.trim().toLowerCase() ?? "")
  if (!type || !subtype) return null

  let q = 1
  for (let i = 1; i < parts.length; i++) {
    const param = parts[i]!
    const eq = param.indexOf("=")
    if (eq === -1) continue
    const name = param.slice(0, eq).trim().toLowerCase()
    const value = param.slice(eq + 1).trim()
    if (name === "q") {
      const parsed = Number.parseFloat(value)
      if (!Number.isNaN(parsed)) q = Math.max(0, Math.min(1, parsed))
    }
  }

  const specificity = type === "*" && subtype === "*" ? 1 : subtype === "*" ? 2 : 3

  return { type, subtype, q, specificity, order }
}

export function parseAccept(header: string | null | undefined): AcceptEntry[] {
  if (!header) return []
  const entries: AcceptEntry[] = []
  const pieces = header.split(",")
  for (let i = 0; i < pieces.length; i++) {
    const entry = parseEntry(pieces[i]!, i)
    if (entry) entries.push(entry)
  }
  return entries
}

function matches(entry: AcceptEntry, contentType: string): boolean {
  const [t, s] = contentType.toLowerCase().split("/") as [string, string]
  if (entry.type === "*" && entry.subtype === "*") return true
  if (entry.subtype === "*") return entry.type === t
  return entry.type === t && entry.subtype === s
}

/**
 * Pick the best representation the server can produce given the client's
 * Accept header. Returns the chosen content-type, or null if nothing is
 * acceptable (caller returns 406).
 *
 * Contract:
 *   - null/empty header → returns produces[0] (the server's default).
 *   - For each producible type, find the most specific matching range.
 *     Specific ranges beat wildcards regardless of q. If the best match
 *     has q=0, that type is excluded.
 *   - Among candidates, pick highest q. Tie-break: client-specified order.
 *   - If no producible type has a non-zero match, return null.
 */
export function negotiate(
  header: string | null | undefined,
  produces: readonly string[],
): string | null {
  if (produces.length === 0) return null
  if (!header || header.trim() === "") return produces[0] ?? null

  const entries = parseAccept(header)
  if (entries.length === 0) return produces[0] ?? null

  type Candidate = { contentType: string; q: number; specificity: number; order: number }
  const candidates: Candidate[] = []

  for (const contentType of produces) {
    // Find the most specific matching entry. Specificity wins over q for
    // the *match decision* (e.g. text/html;q=0 rejects text/html even
    // when */*;q=1 follows).
    let best: AcceptEntry | null = null
    for (const entry of entries) {
      if (!matches(entry, contentType)) continue
      if (!best || entry.specificity > best.specificity) best = entry
    }
    if (!best) continue
    if (best.q === 0) continue
    candidates.push({
      contentType,
      q: best.q,
      specificity: best.specificity,
      order: best.order,
    })
  }

  if (candidates.length === 0) return null

  candidates.sort((a, b) => {
    if (b.q !== a.q) return b.q - a.q
    if (b.specificity !== a.specificity) return b.specificity - a.specificity
    return a.order - b.order
  })

  return candidates[0]!.contentType
}
