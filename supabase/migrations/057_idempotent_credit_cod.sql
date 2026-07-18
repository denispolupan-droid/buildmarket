-- ============================================================================
-- 057  Make credit_cod_to_partner idempotent per order (H5)
-- ============================================================================
-- Setting an order 'delivered' twice (dropdown re-select / request retry / a
-- future cron path) credited COD to the partner twice. Guard on an existing
-- cod_credit for the same order_id.
-- ============================================================================
CREATE OR REPLACE FUNCTION credit_cod_to_partner(
  p_customer_id   UUID,
  p_cod_amount    NUMERIC,
  p_np_fee_pct    NUMERIC DEFAULT 2,
  p_order_id      UUID    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_np_fee    NUMERIC;
  v_credit    NUMERIC;
BEGIN
  -- Idempotency: COD for a given order is credited at most once.
  IF p_order_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM partner_balance_transactions
    WHERE order_id = p_order_id AND tx_type = 'cod_credit'
  ) THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'already_credited');
  END IF;

  v_np_fee := round(p_cod_amount * p_np_fee_pct / 100, 2);
  v_credit := p_cod_amount - v_np_fee;

  INSERT INTO partner_balance_transactions
    (customer_id, tx_type, amount, order_id, description, created_by)
  VALUES
    (p_customer_id, 'cod_credit', v_credit, p_order_id,
     format('COD отримано: %s ₴', p_cod_amount), 'system');

  INSERT INTO partner_balance_transactions
    (customer_id, tx_type, amount, order_id, description, created_by)
  VALUES
    (p_customer_id, 'np_fee', -v_np_fee, p_order_id,
     format('Комісія НП %s%%: %s ₴', p_np_fee_pct, v_np_fee), 'system');

  RETURN jsonb_build_object('success', true, 'credited', v_credit, 'np_fee', v_np_fee);
END;
$$;

-- keep it callable only by service_role (matches 053 hardening)
REVOKE EXECUTE ON FUNCTION credit_cod_to_partner(UUID, NUMERIC, NUMERIC, UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION credit_cod_to_partner(UUID, NUMERIC, NUMERIC, UUID) TO service_role;
