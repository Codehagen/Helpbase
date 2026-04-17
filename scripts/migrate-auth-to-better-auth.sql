-- scripts/migrate-auth-to-better-auth.sql
--
-- One-shot migration of Supabase auth.users → Better Auth public.user.
-- Applied 2026-04-17 via Supabase MCP (see DEVICE_FLOW_PLAN.md).
-- Committed here so the shape is reproducible against a fresh DB (dev
-- branches, test envs, future projects).
--
-- Preserves auth.users as a read-only archive; Supabase's own auth.*
-- FKs (identities, sessions, mfa_factors, etc.) continue to reference it.
-- Only the two app-level FKs (tenants.owner_id, llm_usage_events.user_id)
-- are re-pointed at public.user.
--
-- Re-run safety: the INSERT is idempotent (ON CONFLICT DO NOTHING) and
-- the DROP POLICY/CONSTRAINT statements use IF EXISTS. The `ALTER COLUMN
-- ... TYPE text USING ::text` lines are NOT no-ops on a second run —
-- Postgres still rewrites the column and takes an exclusive lock even
-- when the target type matches. Safe to re-run in dev, but avoid on a
-- busy production DB; gate with `SELECT data_type FROM
-- information_schema.columns WHERE ...` if the re-run path matters.

BEGIN;

-- 1. Drop RLS policies that reference auth.uid() via owner_id/user_id.
--    They become inert under Better Auth; writes flow through server-
--    side code using the service role.
DROP POLICY IF EXISTS tenants_delete_own ON public.tenants;
DROP POLICY IF EXISTS tenants_insert_own ON public.tenants;
DROP POLICY IF EXISTS tenants_update_own ON public.tenants;
DROP POLICY IF EXISTS tenants_select_public ON public.tenants;

DROP POLICY IF EXISTS tenant_articles_delete_own ON public.tenant_articles;
DROP POLICY IF EXISTS tenant_articles_insert_own ON public.tenant_articles;
DROP POLICY IF EXISTS tenant_articles_update_own ON public.tenant_articles;

DROP POLICY IF EXISTS tenant_categories_delete_own ON public.tenant_categories;
DROP POLICY IF EXISTS tenant_categories_insert_own ON public.tenant_categories;
DROP POLICY IF EXISTS tenant_categories_update_own ON public.tenant_categories;

DROP POLICY IF EXISTS tenant_chunks_delete_own ON public.tenant_chunks;
DROP POLICY IF EXISTS tenant_chunks_insert_own ON public.tenant_chunks;
DROP POLICY IF EXISTS tenant_chunks_select_own ON public.tenant_chunks;
DROP POLICY IF EXISTS tenant_chunks_update_own ON public.tenant_chunks;

DROP POLICY IF EXISTS tenant_deploys_insert_own ON public.tenant_deploys;
DROP POLICY IF EXISTS tenant_deploys_select_own ON public.tenant_deploys;

DROP POLICY IF EXISTS tenant_mcp_queries_select_own ON public.tenant_mcp_queries;

DROP POLICY IF EXISTS "read own events" ON public.llm_usage_events;

-- 2. Copy auth.users → public.user. UUIDs preserved as 36-char text.
INSERT INTO "user" (id, email, "emailVerified", name, "createdAt", "updatedAt")
SELECT
  u.id::text,
  u.email,
  u.email_confirmed_at IS NOT NULL,
  COALESCE(
    NULLIF(u.raw_user_meta_data->>'full_name', ''),
    NULLIF(u.raw_user_meta_data->>'name', ''),
    split_part(u.email, '@', 1)
  ),
  u.created_at,
  COALESCE(u.updated_at, u.created_at)
FROM auth.users u
WHERE u.email IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- 3. Drop + recreate FKs pointing at public.user.
ALTER TABLE public.llm_usage_events
  DROP CONSTRAINT IF EXISTS llm_usage_events_user_id_fkey;
ALTER TABLE public.tenants
  DROP CONSTRAINT IF EXISTS tenants_owner_id_fkey;

ALTER TABLE public.llm_usage_events
  ALTER COLUMN user_id TYPE text USING user_id::text;
ALTER TABLE public.tenants
  ALTER COLUMN owner_id TYPE text USING owner_id::text;

ALTER TABLE public.llm_usage_events
  ADD CONSTRAINT llm_usage_events_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES "user"(id) ON DELETE CASCADE;

-- 4. Recreate the one RLS policy anon needs (proxy.ts tenant resolution).
CREATE POLICY tenants_select_active
  ON public.tenants
  FOR SELECT
  TO anon, authenticated
  USING (active = true);

COMMENT ON TABLE "user" IS
  'Better Auth: canonical user table. Migrated from Supabase auth.users on 2026-04-17.';

COMMIT;
