"use client"

import { useQuery } from "@tanstack/react-query"
import { usageTodayOptions } from "@/lib/query-options"

export function useUsageToday() {
  return useQuery(usageTodayOptions())
}
