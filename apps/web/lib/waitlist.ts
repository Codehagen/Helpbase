"use server"

import { redirect } from "next/navigation"
import { getServiceRoleClient } from "./supabase-admin"

/**
 * Server action: insert a waitlist signup.
 *
 * Called from the `<form action={joinWaitlist}>` on /waitlist. On success,
 * redirects back with ?status=ok; on error, ?status=error. We do not
 * surface distinct errors (duplicate email, DB down) to the user — this
 * is lead collection, not account creation.
 *
 * Note: emails are PII. We never log them; errors are diagnosed by source +
 * Supabase error code. `source` is validated before use so a crafted URL
 * can't inject arbitrary values into the signups table.
 */

/** Allowed `source` tags for waitlist signups. Anything else → "waitlist". */
const SAFE_SOURCE_RE = /^[a-z0-9_-]{1,40}$/

export async function joinWaitlist(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const rawSource = String(formData.get("source") ?? "waitlist")
  const source = SAFE_SOURCE_RE.test(rawSource) ? rawSource : "waitlist"

  if (!email || !email.includes("@")) {
    redirect("/waitlist?status=error")
  }

  const client = getServiceRoleClient()
  // Deduplicate via the lower(email) unique index — 23505 duplicate is still success.
  const { error } = await client.from("waitlist_signups").insert({ email, source })

  if (error && error.code !== "23505") {
    // No raw email in the log (PII). source + Supabase error code is enough.
    console.error("[waitlist insert failed]", {
      source,
      code: error.code,
      message: error.message,
    })
    redirect("/waitlist?status=error")
  }

  redirect(`/waitlist?status=ok&from=${encodeURIComponent(source)}`)
}
