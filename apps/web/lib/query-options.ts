import { queryOptions } from "@tanstack/react-query"
import type { UsageTodayResponse } from "@workspace/shared/llm-wire"
import { fetchJson } from "./fetchers"
import { usageKeys, tenantKeys } from "./query-keys"

export interface TenantSummary {
  id: string
  slug: string
  name: string | null
}

export interface MyTenantsResponse {
  tenants: TenantSummary[]
}

export function usageTodayOptions() {
  return queryOptions({
    queryKey: usageKeys.today(),
    queryFn: () => fetchJson<UsageTodayResponse>("/api/v1/usage/today"),
    // Quota ticks up as the user issues LLM calls — keep it a bit fresher
    // than the QueryClient-level default.
    staleTime: 30_000,
  })
}

export function myTenantsOptions() {
  return queryOptions({
    queryKey: tenantKeys.mine(),
    queryFn: () => fetchJson<MyTenantsResponse>("/api/v1/tenants/mine"),
  })
}
