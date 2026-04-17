// Query key factories. Hierarchical so invalidation can target a
// single entity or a whole family:
//   invalidateQueries({ queryKey: tenantKeys.all })      → everything
//   invalidateQueries({ queryKey: tenantKeys.detail(5) }) → one tenant
// Matches the qk-factory-pattern rule in .claude/skills/tanstack-query-best-practices.

export const usageKeys = {
  all: ["usage"] as const,
  today: () => [...usageKeys.all, "today"] as const,
}

export const tenantKeys = {
  all: ["tenants"] as const,
  mine: () => [...tenantKeys.all, "mine"] as const,
  details: () => [...tenantKeys.all, "detail"] as const,
  detail: (id: string) => [...tenantKeys.details(), id] as const,
}
