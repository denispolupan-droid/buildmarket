-- 152: об'єкти з міграцій 012–014, які є в тесті, але так і не потрапили в прод
-- (schema-parity 03.11.2026): тригер updated_at на supplier_product_overrides і
-- шість індексів партнерського балансу/виплат/акцій постачальників.
-- Лише CREATE … IF NOT EXISTS / OR REPLACE — даних не чіпає.

DROP TRIGGER IF EXISTS trg_product_overrides_updated_at ON public.supplier_product_overrides;
CREATE TRIGGER trg_product_overrides_updated_at BEFORE UPDATE ON public.supplier_product_overrides FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_payout_requests_customer ON public.partner_payout_requests USING btree (customer_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_payout_requests_pending ON public.partner_payout_requests USING btree (status, requested_at) WHERE (status = 'pending'::text);
CREATE INDEX IF NOT EXISTS idx_pbt_order ON public.partner_balance_transactions USING btree (order_id) WHERE (order_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_product_overrides_supplier ON public.supplier_product_overrides USING btree (supplier_id);
CREATE INDEX IF NOT EXISTS idx_promotions_sku ON public.supplier_promotions USING btree (our_sku) WHERE (our_sku IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_promotions_supplier ON public.supplier_promotions USING btree (supplier_id, is_active);
