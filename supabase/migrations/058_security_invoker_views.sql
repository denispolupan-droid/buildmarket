-- ============================================================================
-- 058  Make financial views respect the caller's RLS (security_invoker)
-- ============================================================================
-- These views ran with the definer's privileges, so anyone able to reach them
-- via PostgREST could read AR balances / procurement / partner reconciliation
-- regardless of RLS. security_invoker=on makes them honour the querying role's
-- RLS; server code uses service_role (unaffected), anon/authenticated get the
-- underlying deny-all RLS. Closes the 6 remaining advisor ERRORs.
-- ============================================================================
DO $$
DECLARE v text;
BEGIN
  FOREACH v IN ARRAY ARRAY[
    'procurement_summary','open_purchase_orders','ar_balances',
    'ar_transactions','ar_aging','partner_balance_reconciliation'
  ]
  LOOP
    IF to_regclass('public.' || v) IS NOT NULL THEN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = on);', v);
    END IF;
  END LOOP;
END $$;
