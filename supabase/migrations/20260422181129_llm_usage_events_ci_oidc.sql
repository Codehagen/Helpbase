-- CI / GitHub Actions OIDC usage + quota lane.
--
-- Parallel to llm_usage_events (user-keyed) so the existing CLI/session
-- path stays untouched. Per-repo quota enforced by the CI auth lane in
-- apps/web/app/api/v1/llm/_shared.ts via get_repo_tokens_today().
-- Global 10M/day cap is shared — CI path increments the same
-- global_daily_tokens row via increment_global_tokens() that user path
-- already uses.
--
-- Keyed on GitHub repository_id (bigint): stable across renames AND org
-- transfers. repo_slug and owner are stored for dashboard readability
-- only — never authoritative for quota.

CREATE TABLE IF NOT EXISTS public.llm_usage_events_ci (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id bigint NOT NULL,
  repo_slug text NOT NULL,
  owner text NOT NULL,
  ref text,
  event_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  route text NOT NULL,
  model text NOT NULL,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer GENERATED ALWAYS AS (prompt_tokens + completion_tokens) STORED,
  cost_usd numeric NOT NULL DEFAULT 0,
  status text NOT NULL,
  latency_ms integer,
  request_id text
);

-- Hot-path index: per-repo "tokens used today" lookup.
CREATE INDEX IF NOT EXISTS llm_usage_events_ci_repo_created_idx
  ON public.llm_usage_events_ci (repo_id, created_at DESC);

-- RLS: service_role bypasses. No anon/authenticated access.
-- The /api/v1/llm/* routes use the service role client (supabase-admin)
-- for every write, mirroring llm_usage_events's posture.
ALTER TABLE public.llm_usage_events_ci ENABLE ROW LEVEL SECURITY;

-- Per-repo "tokens used today" lookup — mirror of get_user_tokens_today
-- shape. No status filter: failed requests count toward quota (prevents
-- retry-storm abuse). Same UTC-midnight reset semantics.
CREATE OR REPLACE FUNCTION public.get_repo_tokens_today(p_repo_id bigint)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(SUM(total_tokens), 0)::bigint
  FROM public.llm_usage_events_ci
  WHERE repo_id = p_repo_id
    AND created_at >= date_trunc('day', now() at time zone 'utc');
$function$;

COMMENT ON TABLE public.llm_usage_events_ci IS
  'Per-GitHub-repo LLM usage from the CI auth lane (OIDC). Parallel to llm_usage_events. Keyed on GitHub repository_id.';
COMMENT ON FUNCTION public.get_repo_tokens_today(bigint) IS
  'Today-so-far token total for a given GitHub repo (UTC midnight reset). Counts successes + failures to block retry storms.';
