-- ============================================================================
-- 052  Security hardening — Phase 1 (database authorization layer)
-- ============================================================================
-- Closes gaps found by Supabase security advisors that the application-code
-- audit missed. Idempotent and drift-safe (guarded by to_regclass / IF EXISTS),
-- so the identical file applies to both prod and test projects.
--
-- All sensitive RPCs are invoked exclusively via the service_role key in server
-- code (verified: lib/accounting/*, app/api/**, scripts/** — no client-session
-- .rpc calls), so revoking EXECUTE from anon/authenticated breaks nothing.
-- ============================================================================

-- ── 1.1  Revoke direct EXECUTE on every SECURITY DEFINER function in `public`
--         from anon/authenticated; keep service_role. Prevents attackers from
--         calling approve_payout / refund_partner_balance / credit_cod_to_partner
--         / charge_partner_balance etc. directly via /rest/v1/rpc, bypassing the
--         application's admin checks.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM   pg_proc p
    JOIN   pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'public'
      AND  p.prosecdef                                   -- SECURITY DEFINER only
      AND  ( has_function_privilege('anon',          p.oid, 'EXECUTE')
          OR has_function_privilege('authenticated', p.oid, 'EXECUTE') )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated;', r.sig);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION %s TO service_role;',           r.sig);
  END LOOP;
END $$;

-- ── 1.2  Enable RLS on two public content tables that had it disabled
--         (direct anon read of drafts + potential anon writes via PostgREST).
--         Public read stays working because lib/blog-db.ts reads with the anon
--         key; writes go through the service_role admin pipeline (RLS-bypassing).
ALTER TABLE public.blog_posts  ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS blog_posts_public_read ON public.blog_posts;
CREATE POLICY blog_posts_public_read ON public.blog_posts
  FOR SELECT TO anon, authenticated
  USING (is_published = true);              -- drafts stay hidden from the public

ALTER TABLE public.product_faq ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_faq_public_read ON public.product_faq;
CREATE POLICY product_faq_public_read ON public.product_faq
  FOR SELECT TO anon, authenticated
  USING (true);                            -- FAQ is public product content

-- ── 1.3  Fix over-permissive / user_metadata-based RLS policies.
--         user_metadata is self-writable by the user, so any policy trusting it
--         is a privilege-escalation vector. Switch to app_metadata (server-only;
--         populated in Phase 2). Also drop the "with_check true" insert policies
--         that let anyone write arbitrary rows directly via PostgREST.
DO $$
BEGIN
  IF to_regclass('public.orders') IS NOT NULL THEN
    -- admin visibility/update: user_metadata -> app_metadata
    DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
    EXECUTE $q$
      CREATE POLICY "Admins can view all orders" ON public.orders
        FOR SELECT TO authenticated
        USING ( ((auth.jwt() -> 'app_metadata') ->> 'role') = 'admin' )
    $q$;

    DROP POLICY IF EXISTS "Admins can update orders" ON public.orders;
    EXECUTE $q$
      CREATE POLICY "Admins can update orders" ON public.orders
        FOR UPDATE TO authenticated
        USING ( ((auth.jwt() -> 'app_metadata') ->> 'role') = 'admin' )
    $q$;

    -- remove the "anyone can insert any order row" policy; scoped guest/own-order
    -- insert policies remain, and real inserts go through service_role anyway.
    DROP POLICY IF EXISTS orders_anyone_insert ON public.orders;
  END IF;

  IF to_regclass('public.stock_notifications') IS NOT NULL THEN
    -- writes happen via service_role in /api/notify-stock; drop the public
    -- "with_check true" insert policy that allows direct PostgREST spam.
    DROP POLICY IF EXISTS stock_notifications_anyone_insert ON public.stock_notifications;
  END IF;

  IF to_regclass('public.price_change_log') IS NOT NULL THEN
    DROP POLICY IF EXISTS admin_all ON public.price_change_log;
    EXECUTE $q$
      CREATE POLICY admin_all ON public.price_change_log
        FOR ALL TO public
        USING      ( ((auth.jwt() -> 'app_metadata') ->> 'role') = 'admin' )
        WITH CHECK ( ((auth.jwt() -> 'app_metadata') ->> 'role') = 'admin' )
    $q$;
  END IF;
END $$;

-- ── 1.4  Pin search_path on every function that lacks it (prevents search_path
--         hijacking of SECURITY DEFINER functions).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM   pg_proc p
    JOIN   pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'public'
      AND  p.prokind = 'f'
      AND  NOT EXISTS (
             SELECT 1 FROM unnest(coalesce(p.proconfig, '{}'::text[])) c
             WHERE c LIKE 'search_path=%'
           )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp;', r.sig);
  END LOOP;
END $$;
