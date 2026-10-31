-- test-sync-2026-10-31.sql — вирівнювання ТЕСТОВОЇ бази з продом по RLS і політиках.
-- Знахідка 31.10.2026: щоденна перевірка схем порівнювала лише колонки; на тесті RLS
-- був вимкнений на 23 таблицях і бракувало 30 політик, які є на проді (тест = підмножина,
-- зайвого на тесті не було). Застосовано лише на test (mdrextghmuzkyelpqsgp); прод не чіпали.
-- Згенеровано з pg_policies прода. Після цього schema-parity.yml порівнює й RLS/політики.

-- 1. RLS на таблицях, де прод має true, тест false
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ar_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.counterparty_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.landed_cost_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.money_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_number_seq ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_card_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_characteristics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uom_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;

-- 2. Політики прода, яких немає на тесті
CREATE POLICY internal_only ON public.acc_doc_sequences AS permissive FOR ALL TO public USING (false);
CREATE POLICY internal_only ON public.acc_doc_types AS permissive FOR ALL TO public USING (false);
CREATE POLICY internal_only ON public.acc_document_lines AS permissive FOR ALL TO public USING (false);
CREATE POLICY internal_only ON public.acc_documents AS permissive FOR ALL TO public USING (false);
CREATE POLICY internal_only ON public.acc_expense_categories AS permissive FOR ALL TO public USING (false);
CREATE POLICY internal_only ON public.acc_expenses AS permissive FOR ALL TO public USING (false);
CREATE POLICY internal_only ON public.acc_payment_methods AS permissive FOR ALL TO public USING (false);
CREATE POLICY internal_only ON public.acc_payments AS permissive FOR ALL TO public USING (false);
CREATE POLICY internal_only ON public.ar_corrections AS permissive FOR ALL TO public USING (false);
CREATE POLICY categories_public_read ON public.categories AS permissive FOR SELECT TO public USING (true);
CREATE POLICY internal_only ON public.counterparty_balances AS permissive FOR ALL TO public USING (false);
CREATE POLICY internal_only ON public.customer_contracts AS permissive FOR ALL TO public USING (false);
CREATE POLICY internal_only ON public.expenses AS permissive FOR ALL TO public USING (false);
CREATE POLICY internal_only ON public.landed_cost_lines AS permissive FOR ALL TO public USING (false);
CREATE POLICY internal_only ON public.money_entries AS permissive FOR ALL TO public USING (false);
CREATE POLICY "Allow guest order inserts" ON public.orders AS permissive FOR INSERT TO anon WITH CHECK ((user_id IS NULL));
CREATE POLICY partner_no_write ON public.partner_balance_transactions AS permissive FOR INSERT TO public WITH CHECK (false);
CREATE POLICY partner_read_own ON public.partner_balance_transactions AS permissive FOR SELECT TO public USING ((customer_id = ( SELECT customers.id
   FROM customers
  WHERE (customers.auth_user_id = auth.uid()))));
CREATE POLICY partner_no_write ON public.partner_payout_requests AS permissive FOR INSERT TO public WITH CHECK (false);
CREATE POLICY partner_read_own ON public.partner_payout_requests AS permissive FOR SELECT TO public USING ((customer_id = ( SELECT customers.id
   FROM customers
  WHERE (customers.auth_user_id = auth.uid()))));
CREATE POLICY internal_only ON public.price_history AS permissive FOR ALL TO public USING (false);
CREATE POLICY product_characteristics_public_read ON public.product_characteristics AS permissive FOR SELECT TO public USING (true);
CREATE POLICY product_stock_public_read ON public.product_stock AS permissive FOR SELECT TO public USING (true);
CREATE POLICY products_public_read ON public.products AS permissive FOR SELECT TO public USING (true);
CREATE POLICY internal_only ON public.search_queries AS permissive FOR ALL TO public USING (false);
CREATE POLICY internal_only ON public.stock_balance AS permissive FOR ALL TO public USING (false);
CREATE POLICY internal_only ON public.stock_movements AS permissive FOR ALL TO public USING (false);
CREATE POLICY internal_only ON public.stock_reservations AS permissive FOR ALL TO public USING (false);
CREATE POLICY internal_only ON public.uom_conversions AS permissive FOR ALL TO public USING (false);
CREATE POLICY internal_only ON public.warehouses AS permissive FOR ALL TO public USING (false);
