/**
 * Helpbase marketing-surface analytics.
 *
 * Posts events to the Supabase edge function `track` at
 * ${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/track. The edge function
 * hashes IP+UA+day into a session_hash so no raw PII lands in the table.
 *
 * Never awaits. Never throws. Never blocks rendering.
 * See supabase/functions/track/index.ts for the server side.
 */

export type MarketingEvent =
  | "page_view"
  | "hero_install_copied"
  | "hero_install_options_clicked"
  | "hero_demo_clicked"
  | "pricing_tier_clicked"
  | "demo_opened"
  | "faq_expanded"
  | "install_catalog_copied"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export function track(
  event: MarketingEvent,
  metadata: Record<string, unknown> = {},
): void {
  if (typeof window === "undefined") return
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return

  const body = JSON.stringify({
    event,
    path: window.location.pathname + window.location.search,
    metadata,
  })

  try {
    fetch(`${SUPABASE_URL}/functions/v1/track`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body,
      keepalive: true,
    }).catch(() => {
      /* swallow — analytics must never break the page */
    })
  } catch {
    /* swallow */
  }
}
