-- ============================================================================
-- 059  Revoke EXECUTE on guard_user_metadata() (and any later SECURITY DEFINER fns)
-- ============================================================================
-- guard_user_metadata() was created in migration 055, AFTER the 052/053 revoke
-- pass, so it kept the default PUBLIC grant and was still callable by anon /
-- authenticated via /rest/v1/rpc (flagged by the Supabase linter). It is a
-- trigger function — triggers fire regardless of the caller's EXECUTE privilege,
-- so revoking direct EXECUTE is safe and closes the RPC surface.
-- Re-running the same idempotent loop also backstops any future secdef function
-- that slips in without an explicit revoke.
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
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon;', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated;', r.sig);
  END LOOP;
END $$;
