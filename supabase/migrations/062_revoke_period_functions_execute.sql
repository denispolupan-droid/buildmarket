-- ============================================================================
-- 062  Close public RPC access to open_period/close_period (+ re-affirm policy)
-- ============================================================================
-- open_period()/close_period() were added later (accounting period lock) and, per
-- Postgres defaults, got the implicit PUBLIC EXECUTE grant — so anon/authenticated
-- could open/close accounting periods via /rest/v1/rpc (flagged by the linter).
-- Neither function checks the caller's role internally; the app calls them only from
-- an admin-gated route via service_role.
--
-- Re-run the revoke over ALL public SECURITY DEFINER functions AND grant service_role
-- explicitly first — new functions' service_role access comes via PUBLIC, so revoking
-- PUBLIC without an explicit grant would break server code. Idempotent; backstops any
-- future secdef function too.
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
