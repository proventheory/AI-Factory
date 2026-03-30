-- Supabase Security Advisor: rls_disabled_in_public, sensitive_columns_exposed
-- 1) Enable RLS on every public base table that does not already have it.
--    PostgREST exposes public.* to anon/authenticated; without RLS, exposure follows GRANTs.
--    Control Plane / workers use DATABASE_URL (privileged role, typically bypasses RLS as owner).
--    Supabase service_role JWT bypasses RLS.
-- 2) Drop permissive SELECT policies on credential / secret tables so anon/authenticated
--    cannot read them via PostgREST (API must use service role or DB pool).

-- ---------------------------------------------------------------------------
-- 1) Enable RLS on all public tables missing it
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Remove public-read policies on tables holding secrets / OAuth / vault pointers
--    (RLS stays ON; with no policies, anon/authenticated get no rows via PostgREST.)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "brand_google_credentials_select" ON public.brand_google_credentials;
DROP POLICY IF EXISTS "initiative_google_credentials_select" ON public.initiative_google_credentials;
DROP POLICY IF EXISTS "brand_shopify_credentials_select" ON public.brand_shopify_credentials;
DROP POLICY IF EXISTS "mcp_server_config_select" ON public.mcp_server_config;
DROP POLICY IF EXISTS "secret_refs_select" ON public.secret_refs;
DROP POLICY IF EXISTS "secret_access_events_select" ON public.secret_access_events;
