import { toNextJsHandler } from "better-auth/next-js"
import { auth } from "@/lib/auth"

// Better Auth's Next.js adapter. Handles every /api/auth/* route:
//   GET  /api/auth/ok                      → health check
//   POST /api/auth/sign-in/magic-link      → triggers sendMagicLink
//   GET  /api/auth/verify-magic-link       → consumes the magic token, sets session cookie
//   GET  /api/auth/session                 → reads current session (cookie or Bearer)
//   POST /api/auth/sign-out                → clears session
//   ... plus every plugin-mounted route (bearer, magicLink, later deviceAuthorization)
//
// All auth state lives in the database (public.user / public.session / public.account
// / public.verification). No cookies-in-proxy or token-in-proxy logic — plugins own it.

export const { GET, POST } = toNextJsHandler(auth.handler)
