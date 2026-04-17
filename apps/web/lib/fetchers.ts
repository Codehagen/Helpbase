import type { WireErrorBody } from "@workspace/shared/llm-wire"

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly body: WireErrorBody | null

  constructor(status: number, code: string, message: string, body: WireErrorBody | null = null) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
    this.body = body
  }
}

// Web client fetcher. Same-origin → Better Auth cookies forward automatically,
// so we don't need to plumb a bearer token. CLI path uses the shared
// `fetchUsageToday` in packages/shared/src/llm.ts instead.
export async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  // Normalize headers so Headers instances and string[][] inputs don't get
  // dropped by the object spread. Accept always ends up set unless the caller
  // explicitly overrode it.
  const merged = new Headers(init?.headers)
  if (!merged.has("Accept")) merged.set("Accept", "application/json")

  const res = await fetch(input, {
    ...init,
    credentials: "same-origin",
    headers: merged,
  })

  if (!res.ok) {
    let body: WireErrorBody | null = null
    try {
      body = (await res.json()) as WireErrorBody
    } catch {
      // non-JSON error body — fall through with null
    }
    throw new ApiError(
      res.status,
      body?.error ?? `http_${res.status}`,
      body?.message ?? res.statusText ?? "Request failed",
      body,
    )
  }

  // 204 No Content (or any 2xx with empty body) would make res.json() throw
  // a SyntaxError that bypasses ApiError. Short-circuit before the parse.
  if (res.status === 204) return undefined as T

  return (await res.json()) as T
}
