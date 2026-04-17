/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import "@testing-library/jest-dom/vitest"

// Vitest 4 doesn't wire RTL's afterEach cleanup by default — renders
// accumulate in document.body across tests without this.
afterEach(() => {
  cleanup()
})

/**
 * Integration layer for AuthorizeDeviceClient. The pure transition
 * logic is covered by phase-reducer.test.ts — these tests verify
 *   (a) the useReducer is wired up to the effect + dispatch sites,
 *   (b) provider-prop rendering respects the availability map,
 *   (c) async handlers dispatch the expected actions on success + error.
 *
 * Only the minimum set of flows is covered here. Add a new reducer
 * test before adding another integration test.
 */

// Module-level stubs — tests override behavior per-case.
// Types left inferred rather than using generic `vi.fn<...>()` because the
// `<[],` syntax trips rolldown's JSX parser in .tsx files.
const mockUseSession = vi.fn()
const mockSignInMagicLink = vi.fn()
const mockSignInSocial = vi.fn()
const mockDeviceApprove = vi.fn()
const mockDeviceDeny = vi.fn()

vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({
    useSession: mockUseSession,
    signIn: {
      magicLink: mockSignInMagicLink,
      social: mockSignInSocial,
    },
    device: {
      approve: mockDeviceApprove,
      deny: mockDeviceDeny,
    },
  }),
}))

vi.mock("better-auth/client/plugins", () => ({
  magicLinkClient: () => ({}),
  deviceAuthorizationClient: () => ({}),
}))

// Import AFTER mocks so the module-level createAuthClient() call
// picks up the stub.
const { AuthorizeDeviceClient } = await import("./AuthorizeDeviceClient")

beforeEach(() => {
  mockUseSession.mockReset()
  mockSignInMagicLink.mockReset()
  mockSignInSocial.mockReset()
  mockDeviceApprove.mockReset()
  mockDeviceDeny.mockReset()
})

const bothProviders = { google: true, github: true } as const
const noProviders = { google: false, github: false } as const

describe("AuthorizeDeviceClient — derivation", () => {
  it("renders the loading placeholder while session is pending", () => {
    mockUseSession.mockReturnValue({ data: null, isPending: true })
    render(
      <AuthorizeDeviceClient
        initialUserCode="ABCD-EFGH"
        providers={bothProviders}
      />,
    )
    expect(screen.getByText(/checking session/i)).toBeInTheDocument()
  })

  it("routes to signed-out when the user has no session", async () => {
    mockUseSession.mockReturnValue({ data: null, isPending: false })
    render(
      <AuthorizeDeviceClient
        initialUserCode="ABCD-EFGH"
        providers={bothProviders}
      />,
    )
    expect(
      await screen.findByRole("button", { name: /send sign-in link/i }),
    ).toBeInTheDocument()
    // a11y: <label> is bound to <input> via htmlFor/id, so the email field
    // has an accessible name. Screen readers announce it; regression would
    // mean reverting to a stranded <label>.
    expect(screen.getByRole("textbox", { name: /email/i })).toBeInTheDocument()
  })

  it("routes to signed-in when session + userCode present", async () => {
    mockUseSession.mockReturnValue({
      data: { user: { email: "x@y.com" } },
      isPending: false,
    })
    render(
      <AuthorizeDeviceClient
        initialUserCode="ABCD-EFGH"
        providers={bothProviders}
      />,
    )
    expect(await screen.findByRole("button", { name: /authorize/i }))
      .toBeInTheDocument()
    expect(screen.getByText(/signed in as/i)).toBeInTheDocument()
    expect(screen.getByText("x@y.com")).toBeInTheDocument()
    expect(screen.getByText("ABCD-EFGH")).toBeInTheDocument()
  })
})

describe("AuthorizeDeviceClient — providers prop", () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue({ data: null, isPending: false })
  })

  it("renders both OAuth buttons when both providers are enabled", async () => {
    render(
      <AuthorizeDeviceClient
        initialUserCode="ABCD-EFGH"
        providers={bothProviders}
      />,
    )
    expect(
      await screen.findByRole("button", { name: /continue with google/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /continue with github/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/new provider or email/i)).toBeInTheDocument()
  })

  it("hides OAuth buttons and divider when no providers are enabled", async () => {
    render(
      <AuthorizeDeviceClient
        initialUserCode="ABCD-EFGH"
        providers={noProviders}
      />,
    )
    await screen.findByRole("button", { name: /send sign-in link/i })
    expect(
      screen.queryByRole("button", { name: /continue with google/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /continue with github/i }),
    ).not.toBeInTheDocument()
    expect(screen.getByText(/new email creates one/i)).toBeInTheDocument()
  })

  it("renders only the enabled provider when one is configured", async () => {
    render(
      <AuthorizeDeviceClient
        initialUserCode="ABCD-EFGH"
        providers={{ google: true, github: false }}
      />,
    )
    expect(
      await screen.findByRole("button", { name: /continue with google/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /continue with github/i }),
    ).not.toBeInTheDocument()
  })
})

describe("AuthorizeDeviceClient — magic-link handler", () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue({ data: null, isPending: false })
  })

  it("dispatches MAGIC_LINK_SENT on success and shows the email-sent screen", async () => {
    mockSignInMagicLink.mockResolvedValue({ error: null })
    const user = userEvent.setup()
    render(
      <AuthorizeDeviceClient
        initialUserCode="ABCD-EFGH"
        providers={bothProviders}
      />,
    )
    const emailInput = await screen.findByPlaceholderText("you@company.com")
    await user.type(emailInput, "x@y.com")
    await user.click(screen.getByRole("button", { name: /send sign-in link/i }))

    await waitFor(() => {
      expect(mockSignInMagicLink).toHaveBeenCalledWith({
        email: "x@y.com",
        callbackURL: "/device?user_code=ABCD-EFGH",
      })
    })
    // Assert unique email-sent copy. The prior /check/i regex also matched
    // "Checking session…" on the loading screen, so it was false-confidence.
    expect(
      await screen.findByText(/for your.*sign-in link/i),
    ).toBeInTheDocument()
    expect(screen.getByText("x@y.com")).toBeInTheDocument()
  })

  it("dispatches ERROR when magic-link returns an error", async () => {
    mockSignInMagicLink.mockResolvedValue({
      error: { message: "Rate limited" },
    })
    const user = userEvent.setup()
    render(
      <AuthorizeDeviceClient
        initialUserCode="ABCD-EFGH"
        providers={bothProviders}
      />,
    )
    const emailInput = await screen.findByPlaceholderText("you@company.com")
    await user.type(emailInput, "x@y.com")
    await user.click(screen.getByRole("button", { name: /send sign-in link/i }))

    expect(await screen.findByText("Rate limited")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /try again/i }),
    ).toBeInTheDocument()
  })
})

describe("AuthorizeDeviceClient — social sign-in handler", () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue({ data: null, isPending: false })
  })

  it("calls signIn.social with the chosen provider and preserved userCode", async () => {
    // Never resolves — simulates the browser starting its OAuth redirect.
    mockSignInSocial.mockImplementation(() => new Promise(() => {}))
    const user = userEvent.setup()
    render(
      <AuthorizeDeviceClient
        initialUserCode="ABCD-EFGH"
        providers={bothProviders}
      />,
    )
    await user.click(
      await screen.findByRole("button", { name: /continue with google/i }),
    )
    await waitFor(() => {
      expect(mockSignInSocial).toHaveBeenCalledWith({
        provider: "google",
        callbackURL: "/device?user_code=ABCD-EFGH",
      })
    })
  })

  it("dispatches ERROR when signIn.social throws", async () => {
    mockSignInSocial.mockRejectedValue(new Error("OAuth config bad"))
    const user = userEvent.setup()
    render(
      <AuthorizeDeviceClient
        initialUserCode="ABCD-EFGH"
        providers={bothProviders}
      />,
    )
    await user.click(
      await screen.findByRole("button", { name: /continue with github/i }),
    )
    expect(await screen.findByText("OAuth config bad")).toBeInTheDocument()
  })

  it("disables all sign-in surfaces while a social redirect is in flight", async () => {
    // Prevents a user double-clicking Google (or clicking GitHub mid-flight)
    // and firing two concurrent OAuth redirects. The component gates
    // everything on `socialBusy || submitting`.
    mockSignInSocial.mockImplementation(() => new Promise(() => {}))
    const user = userEvent.setup()
    render(
      <AuthorizeDeviceClient
        initialUserCode="ABCD-EFGH"
        providers={bothProviders}
      />,
    )
    await user.click(
      await screen.findByRole("button", { name: /continue with google/i }),
    )
    await waitFor(() => {
      // Label flips to "Redirecting…" once the submit starts.
      expect(
        screen.getByRole("button", { name: /redirecting…/i }),
      ).toBeDisabled()
    })
    expect(
      screen.getByRole("button", { name: /continue with github/i }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", { name: /send sign-in link/i }),
    ).toBeDisabled()
  })
})

describe("AuthorizeDeviceClient — approve/deny handlers", () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue({
      data: { user: { email: "x@y.com" } },
      isPending: false,
    })
  })

  it("dispatches APPROVE_SUCCEEDED and shows the approved screen", async () => {
    mockDeviceApprove.mockResolvedValue({ error: null })
    const user = userEvent.setup()
    render(
      <AuthorizeDeviceClient
        initialUserCode="ABCD-EFGH"
        providers={bothProviders}
      />,
    )
    await user.click(
      await screen.findByRole("button", { name: /^authorize$/i }),
    )
    expect(
      await screen.findByText(/return to your terminal/i),
    ).toBeInTheDocument()
    expect(mockDeviceApprove).toHaveBeenCalledWith({ userCode: "ABCD-EFGH" })
  })

  it("dispatches ERROR with RFC error_description on access_denied", async () => {
    mockDeviceApprove.mockResolvedValue({
      error: { error: "access_denied", error_description: "User said no" },
    })
    const user = userEvent.setup()
    render(
      <AuthorizeDeviceClient
        initialUserCode="ABCD-EFGH"
        providers={bothProviders}
      />,
    )
    await user.click(
      await screen.findByRole("button", { name: /^authorize$/i }),
    )
    expect(await screen.findByText("User said no")).toBeInTheDocument()
  })

  it("falls back to generic copy when RFC error has no description", async () => {
    mockDeviceApprove.mockResolvedValue({
      error: { error: "server_error" },
    })
    const user = userEvent.setup()
    render(
      <AuthorizeDeviceClient
        initialUserCode="ABCD-EFGH"
        providers={bothProviders}
      />,
    )
    await user.click(
      await screen.findByRole("button", { name: /^authorize$/i }),
    )
    expect(
      await screen.findByText(/authorization failed/i),
    ).toBeInTheDocument()
  })

  it("swallows thrown errors from deny and still shows the denied screen", async () => {
    mockDeviceDeny.mockRejectedValue(new Error("network blip"))
    const user = userEvent.setup()
    render(
      <AuthorizeDeviceClient
        initialUserCode="ABCD-EFGH"
        providers={bothProviders}
      />,
    )
    await user.click(await screen.findByRole("button", { name: /cancel/i }))
    expect(await screen.findByText(/cancelled/i)).toBeInTheDocument()
  })

  it("disables both Authorize and Cancel buttons while approve is in flight", async () => {
    // Never-resolving mock keeps us in the approving phase so we can
    // assert the disabled state. Prevents a user from double-clicking
    // Authorize OR pressing Cancel mid-flight, which would dispatch
    // DENIED on top of an in-flight approve.
    mockDeviceApprove.mockImplementation(() => new Promise(() => {}))
    const user = userEvent.setup()
    render(
      <AuthorizeDeviceClient
        initialUserCode="ABCD-EFGH"
        providers={bothProviders}
      />,
    )
    const authorize = await screen.findByRole("button", { name: /^authorize$/i })
    const cancel = screen.getByRole("button", { name: /cancel/i })
    await user.click(authorize)
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /authorizing…/i }),
      ).toBeDisabled()
    })
    expect(cancel).toBeDisabled()
  })
})

describe("AuthorizeDeviceClient — Try again button", () => {
  it("routes back to signed-in when session is still valid", async () => {
    mockUseSession.mockReturnValue({
      data: { user: { email: "x@y.com" } },
      isPending: false,
    })
    mockDeviceApprove.mockResolvedValue({
      error: { error: "server_error", error_description: "boom" },
    })
    const user = userEvent.setup()
    render(
      <AuthorizeDeviceClient
        initialUserCode="ABCD-EFGH"
        providers={bothProviders}
      />,
    )
    // Enter the error state via a failed approve…
    await user.click(
      await screen.findByRole("button", { name: /^authorize$/i }),
    )
    await user.click(
      await screen.findByRole("button", { name: /try again/i }),
    )
    // …and confirm we're back on the signed-in surface.
    expect(
      await screen.findByRole("button", { name: /^authorize$/i }),
    ).toBeInTheDocument()
  })

  // Note: the reverse case — "Try again with no session routes to
  // signed-out" — is covered by the pure reducer test. Reaching that
  // state from the integration layer is impossible in practice because
  // a session change makes the useEffect re-run SESSION_RESOLVED,
  // which overrides the error phase before the user can click.
})
