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
 */
export async function joinWaitlist(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const source = String(formData.get("source") ?? "waitlist")

  if (!email || !email.includes("@")) {
    redirect("/waitlist?status=error")
  }

  const client = getServiceRoleClient()
  // Deduplicate via the lower(email) unique index — 23505 duplicate is still success.
  const { error } = await client.from("waitlist_signups").insert({ email, source })

  if (error && error.code !== "23505") {
    console.error("[waitlist insert failed]", { email, source, message: error.message })
    redirect("/waitlist?status=error")
  }

  redirect(`/waitlist?status=ok&from=${encodeURIComponent(source)}`)
}
