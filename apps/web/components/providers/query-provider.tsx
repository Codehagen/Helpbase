"use client"

import { QueryClientProvider } from "@tanstack/react-query"
import dynamic from "next/dynamic"
import type { ReactNode } from "react"
import { getQueryClient } from "@/lib/get-query-client"

// Devtools are dev-only: dynamic-imported so webpack can tree-shake
// the package out of the production bundle (not just no-op at runtime).
const ReactQueryDevtools =
  process.env.NODE_ENV === "production"
    ? () => null
    : dynamic(
        () =>
          import("@tanstack/react-query-devtools").then((m) => ({
            default: m.ReactQueryDevtools,
          })),
        { ssr: false },
      )

export function QueryProvider({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient()
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
