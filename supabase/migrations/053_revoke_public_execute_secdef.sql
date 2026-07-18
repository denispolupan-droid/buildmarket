-- ============================================================================
-- 053  Security hardening — revoke PUBLIC EXECUTE on SECURITY DEFINER functions
-- ============================================================================
-- 052 revoked EXECUTE from anon/authenticated, but these functions carry the
-- Postgres default PUBLIC grant (acl `=X/postgres`), which anon/authenticated
-- inherit — so they were still reachable via /rest/v1/rpc. Revoke from PUBLIC.
-- service_role keeps its own explicit grant, so all server code keeps working.
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
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC;', r.sig);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO service_role;', r.sig);
  END LOOP;
END $$;
