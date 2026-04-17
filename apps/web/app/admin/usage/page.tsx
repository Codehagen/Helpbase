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

// Keep this route dynamic. Auth-gated + per-user data is never safe to
// prerender, and we want a defensive barrier against future PPR/ISR
// project-wide config flipping this to cached-by-default.
export const dynamic = "force-dynamic"

export default async function UsagePage() {
  // The layout already auth-gates, but we also need `userId` + `email`
  // here to call the data layer. Re-resolving is cheap (cookie → session
  // via Better Auth's in-memory cache for the same request).
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) redirect("/device")

  // Direct data-layer call + setQueryData avoids a self-HTTP round-trip.
  // `updatedAt: Date.now()` is critical: without it the hydrated entry
  // has dataUpdatedAt=0, so useSuspenseQuery treats it as stale and
  // refetches on mount — defeating the whole point of seeding.
  const queryClient = getQueryClient()
  // Fallback to user id matches the layout's header display — an OAuth
  // user with the email scope dropped still gets *something* identifying.
  const data = await getUsageTodayForUser(session.user.id, session.user.email ?? session.user.id)
  queryClient.setQueryData(usageKeys.today(), data, { updatedAt: Date.now() })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Suspense fallback={<UsageCardSkeleton />}>
        <UsageCard />
      </Suspense>
    </HydrationBoundary>
  )
}
