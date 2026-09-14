-- ============================================================================
-- 118  credit_cod_to_partner: комісія НП утримувалась з партнера ДВІЧІ
-- ============================================================================
-- Було: cod_credit = наложка − комісія, і окремо np_fee = −комісія. Баланс
-- партнера зменшувався на комісію двічі (при 450 ₴ і 0,5 % партнер отримував
-- 445,50 замість 447,75), а рядок «COD отримано: 450 ₴» показував 447,75.
-- Стало: cod_credit = повна наложка, np_fee = −комісія — чисто рівно на комісію,
-- і обидва рядки в кабінеті кажуть правду. На 14.09.2026 у проді жодного
-- cod_credit не було, тож перерахунок історії не потрібен.
-- Знайдено інтеграційним тестом tests/accounting/partner-ledger.test.ts.
-- ============================================================================
CREATE OR REPLACE FUNCTION credit_cod_to_partner(
  p_customer_id   UUID,
  p_cod_amount    NUMERIC,
  p_np_fee_pct    NUMERIC DEFAULT 0.5,
  p_order_id      UUID    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_np_fee NUMERIC;
BEGIN
  -- Idempotency: COD for a given order is credited at most once.
  IF p_order_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM partner_balance_transactions
    WHERE order_id = p_order_id AND tx_type = 'cod_credit'
  ) THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'already_credited');
  END IF;

  IF p_cod_amount IS NULL OR p_cod_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Сума наложки має бути більшою за 0');
  END IF;

  v_np_fee := round(p_cod_amount * p_np_fee_pct / 100, 2);

  INSERT INTO partner_balance_transactions
    (customer_id, tx_type, amount, order_id, description, created_by)
  VALUES
    (p_customer_id, 'cod_credit', p_cod_amount, p_order_id,
     format('Накладений платіж отримано: %s ₴', p_cod_amount), 'system');

  IF v_np_fee > 0 THEN
    INSERT INTO partner_balance_transactions
      (customer_id, tx_type, amount, order_id, description, created_by)
    VALUES
      (p_customer_id, 'np_fee', -v_np_fee, p_order_id,
       format('Комісія НоваПей %s%%: %s ₴', p_np_fee_pct, v_np_fee), 'system');
  END IF;

  RETURN jsonb_build_object('success', true, 'credited', p_cod_amount - v_np_fee, 'np_fee', v_np_fee);
END;
$$;

REVOKE EXECUTE ON FUNCTION credit_cod_to_partner(UUID, NUMERIC, NUMERIC, UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION credit_cod_to_partner(UUID, NUMERIC, NUMERIC, UUID) TO service_role;
