import { createRemoteJWKSet, jwtVerify, decodeJwt, errors as joseErrors } from "jose"
import type { JWTPayload } from "jose"

/**
 * GitHub Actions OIDC verifier.
 *
 * Two-lane auth on /api/v1/llm/generate-*:
 *
 *   Authorization: Bearer <token>
 *                          │
 *                          ▼
 *                   peekIssuer()                     ← cheap, no crypto
 *                   ├── GH OIDC  ──► verifyGithubOidcJwt()  (this file)
 *                   └── anything else ──► Better Auth getSession()
 *
 * CLI users (Better Auth session tokens) see zero change. CI runs inside
 * GitHub Actions request a short-lived JWT via the actions/get-id-token
 * action, pass it as the Bearer, and we verify it against GitHub's JWKS.
 *
 * Constraints locked in 2026-04-22 eng review:
 *   - iss = "https://token.actions.githubusercontent.com" (hardcoded)
 *   - aud = "https://helpbase.dev" (hardcoded, user-visible in workflow YAML)
 *   - algorithms: RS256 only (prevents alg:none + alg-confusion attacks)
 *   - clockTolerance: 60s (JWT TTL ~6 min, generous but safe)
 *   - Fork-PR defensive reject (belt + suspenders — GitHub by default
 *     doesn't mint tokens for fork PRs, but we verify anyway)
 */

export const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com"
export const GITHUB_OIDC_JWKS_URL = `${GITHUB_OIDC_ISSUER}/.well-known/jwks`
export const HELPBASE_OIDC_AUDIENCE = "https://helpbase.dev"
export const ALLOWED_ALGORITHMS = ["RS256"] as const
export const CLOCK_TOLERANCE_SECONDS = 60

/**
 * Claims we pull from a verified GitHub OIDC JWT. Names match the token
 * claims GitHub actually emits — see
 * https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect#understanding-the-oidc-token.
 */
export interface GithubOidcClaims extends JWTPayload {
  /** GitHub numeric repo ID. Stable across renames + org transfers. Keyed on this. */
  repository_id: string
  /** `{owner}/{repo}` at time of issue. Informational — do NOT key quota on this. */
  repository: string
  repository_owner: string
  repository_owner_id: string
  /** e.g. `refs/heads/main` */
  ref?: string
  /** e.g. `push`, `pull_request`, `workflow_dispatch`, `schedule` */
  event_name?: string
  /** Present on pull_request events */
  head_ref?: string
  /** Present on pull_request events — the owner of the HEAD (i.e. the fork's owner). */
  head_repository_owner?: string
  workflow?: string
  job_workflow_ref?: string
  actor?: string
}

/**
 * Reasons a JWT was rejected. The API route maps each to a distinct
 * wire error code so the CI log message points at the exact fix.
 */
export type OidcRejectReason =
  | "missing"
  | "malformed"
  | "wrong_issuer"
  | "wrong_audience"
  | "expired"
  | "signature"
  | "algorithm"
  | "fork_pr"
  | "missing_repo_id"
  | "jwks_unreachable"

export class OidcRejected extends Error {
  readonly reason: OidcRejectReason
  constructor(reason: OidcRejectReason, message: string) {
    super(message)
    this.reason = reason
    this.name = "OidcRejected"
  }
}

/**
 * Pull the Bearer token out of an Authorization header. Returns null
 * rather than throwing — absence is a routing decision, not an error.
 */
export function extractBearer(headers: Headers): string | null {
  const raw = headers.get("authorization")
  if (!raw) return null
  if (!raw.toLowerCase().startsWith("bearer ")) return null
  const token = raw.slice(7).trim()
  return token.length > 0 ? token : null
}

/**
 * Peek at a JWT's `iss` claim WITHOUT verifying the signature.
 *
 * This is the routing decision: is this a GH OIDC token (crypto path)
 * or something else (Better Auth path)? Unsafe to trust the claim for
 * authorization — only safe for routing, which is what we do. The
 * signature-verifying path below is what actually gates access.
 *
 * Returns null if the token isn't a well-formed JWT at all (e.g. it's
 * a Better Auth opaque session token).
 */
export function peekIssuer(token: string): string | null {
  try {
    const payload = decodeJwt(token)
    return typeof payload.iss === "string" ? payload.iss : null
  } catch {
    return null
  }
}

/**
 * True if this looks like a GitHub Actions OIDC token, routing-wise.
 * Pre-verification! Do not trust without calling verifyGithubOidcJwt.
 */
export function isGithubOidcToken(token: string): boolean {
  return peekIssuer(token) === GITHUB_OIDC_ISSUER
}

// Remote JWKS — created once per module load. jose caches keys with a
// 10-minute default + cooldown logic for refresh-on-kid-miss, which is
// correct for GitHub's key rotation cadence. Do not disable.
let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null

function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  if (!_jwks) {
    _jwks = createRemoteJWKSet(new URL(GITHUB_OIDC_JWKS_URL))
  }
  return _jwks
}

/** Test-only: reset the JWKS singleton. */
export function __resetJwksForTesting() {
  _jwks = null
}

/** Test-only: inject a JWKS (use with a local signing keypair). */
export function __setJwksForTesting(
  jwks: ReturnType<typeof createRemoteJWKSet>,
) {
  _jwks = jwks
}

/**
 * Verify a GitHub Actions OIDC JWT and return the claims we trust.
 *
 * Throws {@link OidcRejected} on any failure — callers map the reason
 * to an HTTP status + wire error code.
 */
export async function verifyGithubOidcJwt(
  token: string,
): Promise<GithubOidcClaims> {
  let result: { payload: JWTPayload }
  try {
    result = await jwtVerify(token, getJwks(), {
      issuer: GITHUB_OIDC_ISSUER,
      audience: HELPBASE_OIDC_AUDIENCE,
      algorithms: [...ALLOWED_ALGORITHMS],
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
    })
  } catch (err) {
    throw mapJoseError(err)
  }

  const claims = result.payload as GithubOidcClaims

  // Repo ID is what we key quota on. If GitHub didn't send it, something
  // is very wrong (or this is a non-workflow context) — reject loudly.
  if (typeof claims.repository_id !== "string" || claims.repository_id === "") {
    throw new OidcRejected(
      "missing_repo_id",
      "OIDC token missing repository_id claim.",
    )
  }

  // Fork-PR defensive reject. GitHub's default is NOT to mint id-tokens
  // for fork PRs (they can't grant `id-token: write` — only the base
  // repo can). If one somehow arrives, the head owner differs from the
  // base owner, and we bail. Zero-cost belt + suspenders.
  if (
    claims.event_name === "pull_request" &&
    claims.head_repository_owner &&
    claims.head_repository_owner !== claims.repository_owner
  ) {
    throw new OidcRejected(
      "fork_pr",
      "Fork-PR OIDC tokens are not accepted.",
    )
  }

  return claims
}

function mapJoseError(err: unknown): OidcRejected {
  if (err instanceof joseErrors.JWTExpired) {
    return new OidcRejected("expired", "OIDC token has expired.")
  }
  if (err instanceof joseErrors.JWTClaimValidationFailed) {
    const c = err.claim
    if (c === "iss") {
      return new OidcRejected(
        "wrong_issuer",
        "OIDC token issuer is not GitHub Actions.",
      )
    }
    if (c === "aud") {
      return new OidcRejected(
        "wrong_audience",
        `OIDC token audience mismatch. Expected ${HELPBASE_OIDC_AUDIENCE}.`,
      )
    }
    return new OidcRejected(
      "malformed",
      `OIDC token claim validation failed: ${c}`,
    )
  }
  if (err instanceof joseErrors.JWSInvalid || err instanceof joseErrors.JWTInvalid) {
    return new OidcRejected("malformed", "OIDC token is malformed.")
  }
  if (err instanceof joseErrors.JWSSignatureVerificationFailed) {
    return new OidcRejected("signature", "OIDC token signature is invalid.")
  }
  if (err instanceof joseErrors.JOSEAlgNotAllowed) {
    return new OidcRejected(
      "algorithm",
      "OIDC token uses a disallowed algorithm.",
    )
  }
  // JWKSNoMatchingKey, JWKSTimeout, JWKSInvalid — all mean we couldn't
  // reach GitHub's keys or couldn't find a matching key. Treat as
  // upstream unavailability so the client retries rather than hard-failing.
  const name = err instanceof Error ? err.name : "unknown"
  if (name.startsWith("JWKS")) {
    return new OidcRejected(
      "jwks_unreachable",
      "Could not verify OIDC token against GitHub's JWKS endpoint.",
    )
  }
  // Unknown error — safest response is "invalid token" rather than 500.
  return new OidcRejected("malformed", "OIDC token could not be verified.")
}
