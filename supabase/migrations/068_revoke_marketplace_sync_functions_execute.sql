-- ============================================================================
-- 068  Re-lock public RPC access to SECURITY DEFINER functions
-- ============================================================================
-- ensure_marketplace_sync() and set_marketplace_sync_interval(integer) were added
-- in migrations 066/067 (pg_cron marketplace sync) AFTER 062 ran, so per Postgres
-- defaults they inherited the implicit PUBLIC EXECUTE grant — making them callable
-- by anon/authenticated via /rest/v1/rpc (flagged by the secdef exposure guard).
-- They manage the pg_cron sync schedule and are only ever called from admin-gated
-- server routes via service_role.
--
-- Re-run 062's idempotent sweep over ALL public SECURITY DEFINER functions: GRANT
-- service_role explicitly first (its access otherwise flows through PUBLIC, so a
-- bare REVOKE PUBLIC would break server code), then revoke PUBLIC/anon/authenticated.
-- Catches the two new functions and backstops any future secdef stragglers.
-- ============================================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM   pg_proc p
    JOIN   pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'public'
      AND  p.prosecdef
  LOOP
    EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO service_role;', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC;', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon;', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated;', r.sig);
  END LOOP;
END $$;
