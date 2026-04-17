import { redirect } from "next/navigation"

// /admin has no dashboard of its own yet. Redirect to the only real admin
// surface. The layout already auth-gates, so anyone hitting /admin without
// a session gets bounced to /device first, then /admin/usage on return.
export const dynamic = "force-dynamic"

export default function AdminIndexPage(): never {
  redirect("/admin/usage")
}
