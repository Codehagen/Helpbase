import { cache } from "react"
import type { QueryClient } from "@tanstack/react-query"
import { makeQueryClient } from "./query-client"

// On the server, `cache()` gives us one fresh QueryClient per request —
// no cross-request data leaks. On the client, we want a long-lived
// singleton that survives route changes (otherwise Devtools disconnects
// and in-flight queries get cancelled mid-navigation).
let browserQueryClient: QueryClient | undefined

export const getServerQueryClient = cache(() => makeQueryClient())

export function getQueryClient(): QueryClient {
  if (typeof window === "undefined") {
    return getServerQueryClient()
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient()
  }
  return browserQueryClient
}
