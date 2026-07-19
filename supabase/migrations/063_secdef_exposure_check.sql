-- ============================================================================
-- 063  Detector for anon/authenticated-executable SECURITY DEFINER functions
-- ============================================================================
-- Turns the "always REVOKE public execute on new secdef functions" convention into
-- an automated gate: check_secdef_exposure() returns any public SECURITY DEFINER
-- function still callable by anon or authenticated via /rest/v1/rpc. The daily
-- /api/cron/secdef-guard route calls it and alerts if the list is non-empty.
-- SECURITY INVOKER (reads catalogs only), granted to service_role, revoked from
-- public/anon/authenticated so it isn't itself an exposed function.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.check_secdef_exposure()
RETURNS TABLE(func text)
LANGUAGE sql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT p.oid::regprocedure::text
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public'
    AND  p.prosecdef
    AND (has_function_privilege('anon', p.oid, 'EXECUTE')
      OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  ORDER BY 1;
$$;

REVOKE EXECUTE ON FUNCTION public.check_secdef_exposure() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.check_secdef_exposure() TO service_role;
