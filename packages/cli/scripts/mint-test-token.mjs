#!/usr/bin/env node
/**
 * Dev/QA harness: mint a valid user JWT against the real Supabase project
 * without sending email. Uses the service role key to create a test user
 * (if absent) and generate a magic link, then exchanges the OTP for a session
 * — all server-side.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/mint-test-token.mjs
 *   SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/mint-test-token.mjs --email qa@helpbase.dev
 *
 * Output (stdout): the access_token only, so shells can capture it:
 *   export HELPBASE_TOKEN=$(pnpm mint:token)
 *   helpbase whoami
 *
 * Never commit service role keys. This script reads from env only.
 */
import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = "https://yamxvyexqxpdrnoymwhv.supabase.co"
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlhbXh2eWV4cXhwZHJub3ltd2h2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NTI5MjUsImV4cCI6MjA5MTQyODkyNX0.CIV8-oRqCCfTrAIyq0iTLYpEnJHkUkqQ4VU3ImwLUFo"

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!serviceKey) {
  console.error("SUPABASE_SERVICE_ROLE_KEY not set.")
  console.error(
    "Get it from: https://supabase.com/dashboard/project/yamxvyexqxpdrnoymwhv/settings/api",
  )
  process.exit(1)
}

const emailArgIdx = process.argv.indexOf("--email")
const email =
  emailArgIdx >= 0 ? process.argv[emailArgIdx + 1] : "qa-cli@helpbase.dev"
if (!email || !email.includes("@")) {
  console.error(`Invalid email: ${email}`)
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Ensure the user exists and is confirmed. If they already exist, swallow the error.
const { error: createErr } = await admin.auth.admin.createUser({
  email,
  email_confirm: true,
})
if (createErr && !/already|exists|registered/i.test(createErr.message)) {
  console.error(`Failed to create user: ${createErr.message}`)
  process.exit(1)
}

// Generate a magic link server-side — returns the OTP without sending email.
const { data, error } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email,
})
if (error || !data?.properties?.email_otp) {
  console.error(
    `Failed to generate link: ${error?.message ?? "no OTP returned"}`,
  )
  process.exit(1)
}

// Exchange OTP for a session using the public anon client — mirrors what the
// CLI does in verifyLoginCode.
const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
const { data: verified, error: verifyErr } = await anon.auth.verifyOtp({
  email,
  token: data.properties.email_otp,
  type: "email",
})
if (verifyErr || !verified.session) {
  console.error(`Failed to verify OTP: ${verifyErr?.message ?? "no session"}`)
  process.exit(1)
}

// Print only the access token so shells can capture it with $(...).
process.stdout.write(verified.session.access_token)
if (process.stdout.isTTY) process.stdout.write("\n")
