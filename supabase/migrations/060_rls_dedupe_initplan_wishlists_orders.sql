-- ============================================================================
-- 060  RLS cleanup: drop duplicate permissive policies + fix auth initplan
-- ============================================================================
-- Supabase linter flagged:
--   * multiple_permissive_policies on wishlists (own wishlist {select,insert,delete}
--     duplicate the single wishlists_owner_all ALL policy) and on orders
--     (orders_owner_read duplicates "Users can view own orders").
--   * auth_rls_initplan: auth.uid()/auth.jwt() re-evaluated per row. Wrapping in
--     a scalar subselect makes Postgres evaluate them once per query.
-- Access semantics are preserved exactly — only redundant policies are removed and
-- the auth calls are wrapped.
-- ============================================================================

-- ── wishlists ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "own wishlist select" ON public.wishlists;
DROP POLICY IF EXISTS "own wishlist insert" ON public.wishlists;
DROP POLICY IF EXISTS "own wishlist delete" ON public.wishlists;
DROP POLICY IF EXISTS wishlists_owner_all   ON public.wishlists;

CREATE POLICY wishlists_owner_all ON public.wishlists
  FOR ALL TO public
  USING      ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ── orders ───────────────────────────────────────────────────────────────────
-- orders_owner_read (public) is a duplicate of "Users can view own orders"
-- (for anon auth.uid() is NULL so it never matched any row anyway).
DROP POLICY IF EXISTS orders_owner_read ON public.orders;

DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
CREATE POLICY "Users can view own orders" ON public.orders
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
CREATE POLICY "Admins can view all orders" ON public.orders
  FOR SELECT TO authenticated
  USING ((((select auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Users can insert own orders" ON public.orders;
CREATE POLICY "Users can insert own orders" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Admins can update orders" ON public.orders;
CREATE POLICY "Admins can update orders" ON public.orders
  FOR UPDATE TO authenticated
  USING ((((select auth.jwt()) -> 'app_metadata') ->> 'role') = 'admin');

-- "Allow guest order inserts" (anon, user_id IS NULL) is left unchanged.
