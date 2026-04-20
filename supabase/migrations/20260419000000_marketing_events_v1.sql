-- Marketing page analytics. Insert-only from anon, select-only from service role.
-- Hashes IP+UA+day into session_hash so no raw PII lands in the table.

create table if not exists public.marketing_events (
  id bigserial primary key,
  event text not null,
  ts timestamptz not null default now(),
  session_hash text not null,
  path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists marketing_events_event_ts_idx
  on public.marketing_events (event, ts desc);

create index if not exists marketing_events_session_hash_idx
  on public.marketing_events (session_hash);

alter table public.marketing_events enable row level security;

-- Anon can insert events (edge function routes inserts through anon role).
drop policy if exists "marketing_events_anon_insert" on public.marketing_events;
create policy "marketing_events_anon_insert"
  on public.marketing_events
  for insert
  to anon
  with check (true);

-- No select/update/delete policies for anon → those operations are blocked by RLS.
-- service_role bypasses RLS for admin queries.

comment on table public.marketing_events is
  'Helpbase marketing page analytics. Written by edge function track, read by service role only.';
