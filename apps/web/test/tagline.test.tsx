/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/analytics", () => ({
  track: vi.fn(),
}))

// jsdom doesn't implement IntersectionObserver; framer-motion inside the
// hero terminal touches it at mount. No-op stub lets render() complete.
beforeAll(() => {
  class IOStub {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
    root = null
    rootMargin = ""
    thresholds: number[] = []
  }
  globalThis.IntersectionObserver =
    IOStub as unknown as typeof IntersectionObserver
})

import {
  MADE_WITH_SHADCN_LABEL,
  MADE_WITH_SHADCN_URL,
  SHADCN_TAGLINE,
} from "@/lib/tagline"
import { Hero } from "@/components/marketing/hero"
import { Footer } from "@/components/footer"

afterEach(() => {
  cleanup()
})

describe("tagline constants", () => {
  it("SHADCN_TAGLINE matches Shadcn's exact phrasing", () => {
    // Guards against drift from the user-provided quote.
    expect(SHADCN_TAGLINE).toBe("Code in your repo, generated but editable.")
  })

  it("MADE_WITH_SHADCN_URL points to the canonical shadcn home", () => {
    expect(MADE_WITH_SHADCN_URL).toBe("https://ui.shadcn.com")
  })

  it("MADE_WITH_SHADCN_LABEL reads 'Made with shadcn'", () => {
    expect(MADE_WITH_SHADCN_LABEL).toBe("Made with shadcn")
  })
})

describe("marketing surface renders tagline", () => {
  it("Hero renders SHADCN_TAGLINE in the H1", () => {
    render(<Hero />)
    const heading = screen.getByRole("heading", { level: 1 })
    expect(heading).toHaveTextContent(SHADCN_TAGLINE)
  })

  it("Footer renders SHADCN_TAGLINE in its product description", () => {
    render(<Footer />)
    expect(screen.getByText(new RegExp(SHADCN_TAGLINE))).toBeInTheDocument()
  })
})

describe("Made with shadcn badge", () => {
  it("Footer exposes a 'Made with shadcn' link pointing to ui.shadcn.com", () => {
    render(<Footer />)
    const badge = screen.getByLabelText(MADE_WITH_SHADCN_LABEL)
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveAttribute("href", MADE_WITH_SHADCN_URL)
    expect(badge).toHaveAttribute("target", "_blank")
  })
})
