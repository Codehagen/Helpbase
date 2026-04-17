/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen } from "@testing-library/react"
import { Suspense, type ReactNode } from "react"
import { afterEach, describe, expect, it } from "vitest"
import { usageKeys } from "@/lib/query-keys"
import { UsageCard } from "./usage-card"

// Vitest doesn't wire @testing-library/react's auto-cleanup unless
// `globals: true` is set in vitest.config — this project doesn't set
// it, so we clean up between tests manually.
afterEach(() => cleanup())

function wrap(children: ReactNode, client: QueryClient) {
  return (
    <QueryClientProvider client={client}>
      <Suspense fallback={<p>loading</p>}>{children}</Suspense>
    </QueryClientProvider>
  )
}

describe("UsageCard", () => {
  it("renders pre-seeded usage data without hitting the network", () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(usageKeys.today(), {
      email: "founder@example.com",
      quota: {
        usedToday: 42_000,
        dailyLimit: 500_000,
        resetAt: "2026-04-18T00:00:00.000Z",
      },
    })

    render(wrap(<UsageCard />, queryClient))

    expect(screen.getByText("Today\u2019s usage")).toBeInTheDocument()
    expect(screen.getByText("founder@example.com")).toBeInTheDocument()
    expect(screen.getByText("42,000")).toBeInTheDocument()
    expect(screen.getByText("500,000")).toBeInTheDocument()
  })

  it("computes the progress bar from used/limit", () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(usageKeys.today(), {
      email: "",
      quota: {
        usedToday: 125_000,
        dailyLimit: 500_000,
        resetAt: "2026-04-18T00:00:00.000Z",
      },
    })

    render(wrap(<UsageCard />, queryClient))
    const bar = screen.getByRole("progressbar")
    expect(bar.getAttribute("aria-valuenow")).toBe("25")
  })
})
