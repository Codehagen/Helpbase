import type { Metadata } from "next"
import { AuthorizeDeviceClient } from "./AuthorizeDeviceClient"

export const metadata: Metadata = {
  title: "Authorize device · helpbase",
  description: "Authorize a helpbase CLI session.",
  robots: { index: false, follow: false },
}

// We intentionally render without a sidebar/toc chrome — this page is a
// focused auth moment, like gh.io/login/device. Layout lives inline.
export default async function DevicePage({
  searchParams,
}: {
  searchParams: Promise<{ user_code?: string; error?: string }>
}) {
  const params = await searchParams
  const userCode = params.user_code?.trim() ?? ""

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-12">
      <div className="w-full rounded-lg border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold">Authorize helpbase CLI</h1>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            A CLI session on your device is waiting for approval.
          </p>
        </div>
        <AuthorizeDeviceClient initialUserCode={userCode} />
        <div className="mt-6 border-t border-neutral-200 pt-4 text-center text-xs text-neutral-500 dark:border-neutral-800">
          Compare the code above to what your terminal shows. If they don't
          match, close this tab and ignore the link.
        </div>
      </div>
    </main>
  )
}
