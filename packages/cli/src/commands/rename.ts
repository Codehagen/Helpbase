import { Command } from "commander"
import { intro, outro, cancel, note } from "@clack/prompts"
import pc from "picocolors"
import { getCurrentSession } from "../lib/auth.js"
import { renameReservation } from "../lib/tenants-client.js"
import { loadReservation } from "../lib/reservation.js"
import {
  writeCachedReservation,
  clearCachedReservation,
} from "../lib/reservation-cache.js"
import { HelpbaseError, formatError } from "../lib/errors.js"

/**
 * `helpbase rename <new-slug>`
 *
 * Pre-deploy slug rename for an auto-provisioned reservation. The server
 * enforces the deploy gate (`deployed_at IS NULL`); this command is a thin
 * wrapper that:
 *   1. Loads the current reservation (cache-first, falls back to server).
 *   2. Calls PATCH /api/v1/tenants/reservation/slug with the new slug.
 *   3. Updates the local cache so `helpbase whoami` reflects the new URL
 *      immediately — without, the user would see the old slug until the
 *      next `helpbase login` refreshed it.
 *
 * Post-deploy rename is intentionally out of scope. Slug changes after a
 * tenant has been published would need a redirect layer in proxy.ts that
 * we haven't built yet, and the existing published URL might already be
 * linked-to (blog posts, MCP client configs). Ship path for post-deploy
 * slug changes: delete and recreate.
 */

export const renameCommand = new Command("rename")
  .description(
    "Rename your auto-provisioned reservation before first deploy (changes your `.helpbase.dev` subdomain).",
  )
  .argument("<new-slug>", "The new subdomain (lowercase letters, numbers, hyphens; 3-40 chars)")
  .addHelpText(
    "after",
    `
Examples:
  $ helpbase rename acme                    # reserve acme.helpbase.dev
  $ helpbase rename acme-docs

Rename rules:
  - Only works BEFORE your first deploy. After deploy, the slug is fixed.
  - New slug follows the same validation as ${pc.cyan("helpbase deploy --slug")}.
  - If the new slug is taken, you'll get a ${pc.cyan("slug_taken")} error — try another.
`,
  )
  .action(async (newSlug: string) => {
    intro(pc.bgCyan(pc.black(" helpbase rename ")))

    const session = await getCurrentSession()
    if (!session) {
      cancel(
        `Not signed in. Run ${pc.cyan("helpbase login")} first.`,
      )
      process.exit(1)
    }

    const current = await loadReservation(session)
    if (!current) {
      throw new HelpbaseError({
        code: "E_RESERVATION_MISSING",
        problem: "You don't have an active reservation to rename.",
        cause:
          "Renames only apply to the pre-deploy placeholder `docs-<hex>` slug that login auto-provisions. " +
          "After your first deploy (or if you logged in before reservations existed), the tenant's slug is fixed.",
        fix: [
          `To claim a specific slug on first deploy, use ${pc.cyan("helpbase deploy --slug <name>")}.`,
          `To see your current state, run ${pc.cyan("helpbase whoami")}.`,
        ],
      })
    }

    if (current.slug === newSlug) {
      outro(
        `Already reserved ${pc.cyan(current.liveUrl)} — nothing to rename.`,
      )
      return
    }

    try {
      const updated = await renameReservation(session, newSlug)
      // Overwrite the local cache so the next `whoami` / `open` reflects
      // the new slug without a second round-trip.
      writeCachedReservation({
        tenantId: updated.id,
        slug: updated.slug,
        liveUrl: updated.live_url,
        mcpPublicToken: updated.mcp_public_token,
        userId: session.userId,
      })
      note(
        `${pc.dim("Before:")} ${pc.dim(current.liveUrl)}\n` +
          `${pc.dim("After:")}  ${pc.cyan(updated.live_url)}`,
        "Reservation renamed",
      )
      outro(
        `Reserved ${pc.cyan(updated.live_url)} — run ${pc.cyan("helpbase deploy")} to publish.`,
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Translate the server's error codes into HelpbaseError instances
      // so the user gets the structured fix/docs output and the rest of
      // the CLI's error formatting layer kicks in.
      if (/slug_taken/.test(msg)) {
        throw new HelpbaseError({
          code: "E_SLUG_TAKEN",
          problem: `The slug "${newSlug}" is already taken by another helpbase user.`,
          cause: "Each helpbase.dev subdomain must be globally unique.",
          fix: [
            "Pick a different slug and retry.",
            "If you think this is your own tenant, run `helpbase whoami` to confirm.",
          ],
        })
      }
      if (/slug_reserved/.test(msg)) {
        throw new HelpbaseError({
          code: "E_SLUG_RESERVED",
          problem: `The slug "${newSlug}" is reserved by helpbase.`,
          cause:
            "A short list of slugs (www, api, admin, docs, mcp, ...) is reserved so they can't collide with helpbase.dev marketing/auth/infra URLs.",
          fix: ["Pick a different slug and retry."],
        })
      }
      if (/reservation_locked/.test(msg)) {
        clearCachedReservation()
        throw new HelpbaseError({
          code: "E_RESERVATION_LOCKED",
          problem:
            "Your reservation was deployed before the rename could complete.",
          cause:
            "A concurrent `helpbase deploy` flipped the tenant from reservation to live while this rename was in flight. Post-deploy slug changes aren't supported.",
          fix: [
            `Run ${pc.cyan("helpbase whoami")} to see the deployed slug.`,
            `To move content to a different subdomain, delete the tenant and re-create: ${pc.cyan("helpbase deploy --delete <old> --yes")} then ${pc.cyan("helpbase deploy --slug <new>")}.`,
          ],
        })
      }
      if (/no_reservation/.test(msg)) {
        // Server says no reservation even though the cache claimed one —
        // likely the tenant was deleted or deployed from a different
        // shell. Refresh the cache to prevent future confusion.
        clearCachedReservation()
        throw new HelpbaseError({
          code: "E_RESERVATION_MISSING",
          problem: "You don't have an active reservation to rename.",
          cause:
            "The server reports no active reservation for your account. The local cache was stale.",
          fix: [`Run ${pc.cyan("helpbase whoami")} to see your current tenant state.`],
        })
      }
      // Unknown — let it bubble as a plain error.
      cancel(`Rename failed: ${msg}`)
      process.exit(1)
    }
  })
