"use client"

import { useQuery } from "@tanstack/react-query"
import { myTenantsOptions } from "@/lib/query-options"

export function useMyTenants() {
  return useQuery(myTenantsOptions())
}
