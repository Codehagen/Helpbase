-- Drop the anon insert policy on marketing_events.
--
-- Background: the track edge function uses SUPABASE_SERVICE_ROLE_KEY, which
-- bypasses RLS regardless of policy. The anon insert policy was pure attack
-- surface — any script with the public anon key could POST directly to
-- /rest/v1/marketing_events via PostgREST and bypass every server-side
-- guardrail in handler.ts (event allowlist, 2 KB metadata cap, path cap,
-- cf-connecting-ip-derived session_hash).
--
-- After this migration: the service_role client in the edge function is the
-- only path that can write to this table. anon/authenticated roles still
-- cannot SELECT/UPDATE/DELETE (no policies). The table is effectively
-- edge-function-owned, end to end.

drop policy if exists "marketing_events_anon_insert" on public.marketing_events;

-- Keep RLS enabled. With no policies and no role grants, the table is
-- inaccessible via PostgREST — exactly what we want.
alter table public.marketing_events enable row level security;

comment on table public.marketing_events is
  'Helpbase marketing analytics. Written ONLY by the service_role client inside supabase/functions/track (RLS bypass). No direct client access — the edge function is the validator.';
