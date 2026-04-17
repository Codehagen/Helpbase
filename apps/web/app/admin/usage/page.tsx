import { HydrationBoundary, dehydrate } from "@tanstack/react-query"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { auth } from "@/lib/auth"
import { getUsageTodayForUser } from "@/lib/data/usage"
import { getQueryClient } from "@/lib/get-query-client"
import { usageKeys } from "@/lib/query-keys"
import { UsageCard } from "./usage-card"
import { UsageCardSkeleton } from "./loading"

export const metadata: Metadata = {
  title: "Usage · helpbase admin",
  robots: { index: false, follow: false },
}

export default async function UsagePage() {
  // The layout already auth-gates, but we also need `userId` + `email`
  // here to call the data layer. Re-resolving is cheap (cookie → session
  // via Better Auth's in-memory cache for the same request).
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) redirect("/device")

  // Direct data-layer call + setQueryData avoids a self-HTTP round-trip.
  // Client's useSuspenseQuery reads the seeded cache, sees fresh-within-
  // staleTime, and never triggers queryFn — so no content flash.
  const queryClient = getQueryClient()
  const data = await getUsageTodayForUser(session.user.id, session.user.email ?? "")
  queryClient.setQueryData(usageKeys.today(), data)

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<UsageCardSkeleton />}>
        <UsageCard />
      </Suspense>
    </HydrationBoundary>
  )
}
