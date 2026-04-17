import { headers } from "next/headers"
import Link from "next/link"
import { redirect } from "next/navigation"
import type { ReactNode } from "react"
import { auth } from "@/lib/auth"

// Auth-gated surface — never safe to cache or statically render.
export const dynamic = "force-dynamic"

// Auth-gated shell for the admin surface. Server component so
// redirects happen before any client JS ships. Intentionally minimal —
// real shell chrome lives in the first real admin feature's PR.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    redirect("/device")
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4">
        <nav className="mx-auto flex max-w-5xl items-center justify-between">
          <Link href="/admin/usage" className="text-sm font-semibold">
            helpbase admin
          </Link>
          <span className="text-xs text-muted-foreground">
            {session.user.email ?? session.user.id}
          </span>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  )
}
