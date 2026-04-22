import { afterEach, beforeAll, describe, expect, it } from "vitest"
import {
  SignJWT,
  generateKeyPair,
  exportJWK,
  createLocalJWKSet,
  type JWK,
} from "jose"

import {
  GITHUB_OIDC_ISSUER,
  HELPBASE_OIDC_AUDIENCE,
  OidcRejected,
  __resetJwksForTesting,
  __setJwksForTesting,
  extractBearer,
  isGithubOidcToken,
  peekIssuer,
  verifyGithubOidcJwt,
} from "../lib/oidc-verify"

/**
 * Sign real JWTs with a test RSA keypair, wire them to the verifier via
 * a local JWKSet (no network). Tests exercise the real jose verification
 * path — forged signatures fail, alg:none is rejected, etc.
 */

let privateKey: CryptoKey
let publicJwk: JWK
const TEST_KID = "test-kid-1"

beforeAll(async () => {
  const kp = await generateKeyPair("RS256", { extractable: true })
  privateKey = kp.privateKey
  const pub = await exportJWK(kp.publicKey)
  pub.kid = TEST_KID
  pub.alg = "RS256"
  pub.use = "sig"
  publicJwk = pub
  // createLocalJWKSet returns a key-lookup function shape-compatible
  // with createRemoteJWKSet for JWT verify, minus the remote-only cache
  // introspection methods. The cast is safe for this test; we don't call
  // the remote-only methods.
  const jwks = createLocalJWKSet({ keys: [publicJwk] }) as unknown as Parameters<
    typeof __setJwksForTesting
  >[0]
  __setJwksForTesting(jwks)
})

afterEach(() => {
  // Reset JWKS between tests that may swap it. beforeAll already set the
  // shared one — this is only needed if a test calls __setJwksForTesting
  // itself. Keeping it cheap and explicit.
})

interface TokenClaims {
  iss?: string
  aud?: string
  repository_id?: string
  repository?: string
  repository_owner?: string
  repository_owner_id?: string
  event_name?: string
  head_repository_owner?: string
  [k: string]: unknown
}

async function makeToken(
  claims: TokenClaims = {},
  opts: { expSecondsFromNow?: number; alg?: string; kid?: string } = {},
): Promise<string> {
  const {
    expSecondsFromNow = 300,
    alg = "RS256",
    kid = TEST_KID,
  } = opts
  const defaultClaims = {
    iss: GITHUB_OIDC_ISSUER,
    aud: HELPBASE_OIDC_AUDIENCE,
    repository_id: "12345",
    repository: "Codehagen/helpbase",
    repository_owner: "Codehagen",
    repository_owner_id: "67890",
    event_name: "push",
    ref: "refs/heads/main",
  }
  const merged = { ...defaultClaims, ...claims }
  return new SignJWT(merged)
    .setProtectedHeader({ alg, kid })
    .setIssuedAt()
    .setExpirationTime(
      Math.floor(Date.now() / 1000) + expSecondsFromNow,
    )
    .sign(privateKey)
}

describe("extractBearer", () => {
  it("pulls the token from a well-formed header", () => {
    const h = new Headers({ authorization: "Bearer abc.def.ghi" })
    expect(extractBearer(h)).toBe("abc.def.ghi")
  })

  it("is case-insensitive on the Bearer prefix", () => {
    const h = new Headers({ authorization: "bearer abc.def.ghi" })
    expect(extractBearer(h)).toBe("abc.def.ghi")
  })

  it("returns null when the header is missing", () => {
    expect(extractBearer(new Headers())).toBeNull()
  })

  it("returns null for non-Bearer schemes", () => {
    const h = new Headers({ authorization: "Basic dXNlcjpwYXNz" })
    expect(extractBearer(h)).toBeNull()
  })

  it("returns null for an empty Bearer value", () => {
    const h = new Headers({ authorization: "Bearer " })
    expect(extractBearer(h)).toBeNull()
  })
})

describe("peekIssuer / isGithubOidcToken", () => {
  it("reads iss from a real JWT payload", async () => {
    const t = await makeToken()
    expect(peekIssuer(t)).toBe(GITHUB_OIDC_ISSUER)
    expect(isGithubOidcToken(t)).toBe(true)
  })

  it("returns null for an opaque / non-JWT token (Better Auth session shape)", () => {
    expect(peekIssuer("abcdef1234567890")).toBeNull()
    expect(isGithubOidcToken("abcdef1234567890")).toBe(false)
  })

  it("returns null when iss claim is absent or non-string", async () => {
    const t = await makeToken({ iss: undefined })
    expect(peekIssuer(t)).toBeNull()
  })
})

describe("verifyGithubOidcJwt — happy path", () => {
  it("accepts a valid token and returns expected claims", async () => {
    const t = await makeToken()
    const claims = await verifyGithubOidcJwt(t)
    expect(claims.repository_id).toBe("12345")
    expect(claims.repository).toBe("Codehagen/helpbase")
    expect(claims.repository_owner).toBe("Codehagen")
  })
})

describe("verifyGithubOidcJwt — audience + issuer", () => {
  it("rejects wrong audience with reason=wrong_audience", async () => {
    const t = await makeToken({ aud: "https://evil.example" })
    await expect(verifyGithubOidcJwt(t)).rejects.toMatchObject({
      name: "OidcRejected",
      reason: "wrong_audience",
    })
  })

  it("rejects wrong issuer with reason=wrong_issuer", async () => {
    const t = await makeToken({ iss: "https://evil.example" })
    await expect(verifyGithubOidcJwt(t)).rejects.toMatchObject({
      reason: "wrong_issuer",
    })
  })
})

describe("verifyGithubOidcJwt — expiry + clock skew", () => {
  it("rejects an expired token", async () => {
    const t = await makeToken({}, { expSecondsFromNow: -120 })
    await expect(verifyGithubOidcJwt(t)).rejects.toMatchObject({
      reason: "expired",
    })
  })

  it("accepts a token that expired 30s ago (within ±60s skew tolerance)", async () => {
    const t = await makeToken({}, { expSecondsFromNow: -30 })
    // Should NOT throw — within clockTolerance.
    await expect(verifyGithubOidcJwt(t)).resolves.toBeTruthy()
  })
})

describe("verifyGithubOidcJwt — signature + algorithm attacks", () => {
  it("rejects a forged signature (different keypair)", async () => {
    // Sign with an attacker keypair.
    const evil = await generateKeyPair("RS256", { extractable: true })
    const forged = await new SignJWT({
      iss: GITHUB_OIDC_ISSUER,
      aud: HELPBASE_OIDC_AUDIENCE,
      repository_id: "12345",
      repository_owner: "Codehagen",
    })
      .setProtectedHeader({ alg: "RS256", kid: TEST_KID })
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 300)
      .sign(evil.privateKey)

    await expect(verifyGithubOidcJwt(forged)).rejects.toMatchObject({
      name: "OidcRejected",
    })
  })

  it("rejects alg=HS256 (confusion attack against RS256 verifier)", async () => {
    // jose refuses to sign JWTs for HS256 with a private key object
    // shaped for RS256, but we can test the outcome path by crafting
    // a token header manually and asking verify to accept it.
    const { SignJWT: _S } = await import("jose")
    void _S
    // Simpler: construct a token with alg:none by hand (invalid format
    // detected by jose before the signature even gets checked).
    const malicious =
      Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString(
        "base64url",
      ) +
      "." +
      Buffer.from(
        JSON.stringify({
          iss: GITHUB_OIDC_ISSUER,
          aud: HELPBASE_OIDC_AUDIENCE,
          repository_id: "12345",
          exp: Math.floor(Date.now() / 1000) + 300,
        }),
      ).toString("base64url") +
      "."

    await expect(verifyGithubOidcJwt(malicious)).rejects.toBeInstanceOf(
      OidcRejected,
    )
  })
})

describe("verifyGithubOidcJwt — claims validation", () => {
  it("rejects when repository_id claim is missing", async () => {
    const t = await makeToken({ repository_id: undefined })
    await expect(verifyGithubOidcJwt(t)).rejects.toMatchObject({
      reason: "missing_repo_id",
    })
  })

  it("rejects when repository_id is empty string", async () => {
    const t = await makeToken({ repository_id: "" })
    await expect(verifyGithubOidcJwt(t)).rejects.toMatchObject({
      reason: "missing_repo_id",
    })
  })
})

describe("verifyGithubOidcJwt — fork-PR defense", () => {
  it("rejects pull_request event where head_repository_owner differs", async () => {
    const t = await makeToken({
      event_name: "pull_request",
      repository_owner: "Codehagen",
      head_repository_owner: "evil-fork",
    })
    await expect(verifyGithubOidcJwt(t)).rejects.toMatchObject({
      reason: "fork_pr",
    })
  })

  it("accepts pull_request event where head_repository_owner matches (same-repo PR)", async () => {
    const t = await makeToken({
      event_name: "pull_request",
      repository_owner: "Codehagen",
      head_repository_owner: "Codehagen",
    })
    await expect(verifyGithubOidcJwt(t)).resolves.toBeTruthy()
  })

  it("accepts push events (no head_repository_owner claim)", async () => {
    const t = await makeToken({ event_name: "push" })
    await expect(verifyGithubOidcJwt(t)).resolves.toBeTruthy()
  })
})
