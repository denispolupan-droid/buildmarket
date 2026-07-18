-- ============================================================================
-- 056  Webhook idempotency keys (H3)  — additive & safe to apply before deploy
-- ============================================================================
-- Monobank retries webhooks when it doesn't get a timely 2xx. Without a stable
-- idempotency key, a retry double-credits a partner top-up or (under concurrent
-- delivery) double-materialises an order. Add nullable unique keys: NULLs are
-- allowed to repeat (COD orders / manual balance txns), non-null values dedupe.
-- ============================================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_reference text;
CREATE UNIQUE INDEX IF NOT EXISTS orders_payment_reference_key
  ON public.orders (payment_reference);

ALTER TABLE public.partner_balance_transactions
  ADD COLUMN IF NOT EXISTS external_ref text;
CREATE UNIQUE INDEX IF NOT EXISTS partner_balance_tx_external_ref_key
  ON public.partner_balance_transactions (external_ref);
