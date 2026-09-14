-- ============================================================================
-- 117  Виплати дропшип-партнерам: резерв суми заявки (balance_held)
-- ============================================================================
-- Було:
--   • submit_payout_request перевіряв доступний залишок, але нічого не резервував —
--     кілька заявок разом могли перевищити баланс;
--   • approve_payout списував без перевірки залишку (баланс міг піти в мінус);
--   • відхилення — прямий UPDATE з роуту, без функції;
--   • balance_held не заповнював ніхто, «Зарезервовано» в кабінеті завжди 0;
--   • помилки заявки в проді були англійською (партнер бачив «Insufficient funds»).
-- Стало: заявка резервує суму (balance_held += amount), схвалення списує баланс і
-- знімає резерв, відхилення знімає резерв. charge_partner_balance уже рахує
-- доступне як balance − balance_held, тож зарезервоване на замовлення не піде.
-- ============================================================================

CREATE OR REPLACE FUNCTION submit_payout_request(
  p_auth_user_id UUID,
  p_amount       NUMERIC,
  p_method       TEXT,
  p_bank_details TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $func$
DECLARE
  v_customer_id UUID;
  v_balance     NUMERIC(14,2);
  v_held        NUMERIC(14,2);
  v_available   NUMERIC(14,2);
BEGIN
  IF p_amount IS NULL OR p_amount < 500 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Мінімальна сума — 500 ₴');
  END IF;
  IF p_method NOT IN ('bank', 'goods_offset') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Невірний спосіб виплати');
  END IF;
  IF p_method = 'bank' AND coalesce(trim(p_bank_details), '') = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Вкажіть реквізити для переказу');
  END IF;

  SELECT id, balance, balance_held
  INTO   v_customer_id, v_balance, v_held
  FROM   customers
  WHERE  auth_user_id = p_auth_user_id
  FOR    UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Партнера не знайдено');
  END IF;

  v_available := v_balance - v_held;
  IF v_available < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('Недостатньо коштів. Доступно: %s ₴', round(v_available, 2)));
  END IF;

  IF EXISTS (
    SELECT 1 FROM partner_payout_requests
    WHERE customer_id = v_customer_id
      AND status = 'pending'
      AND amount = p_amount
      AND requested_at > NOW() - INTERVAL '60 seconds'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Така заявка вже подана — зачекайте хвилину');
  END IF;

  INSERT INTO partner_payout_requests (customer_id, amount, method, bank_details, status)
  VALUES (v_customer_id, p_amount, p_method, p_bank_details, 'pending');

  UPDATE customers SET balance_held = balance_held + p_amount WHERE id = v_customer_id;

  RETURN jsonb_build_object('success', true, 'available_after', v_available - p_amount);
END;
$func$;


CREATE OR REPLACE FUNCTION approve_payout(
  p_payout_id   UUID,
  p_admin_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $func$
DECLARE
  v_customer_id UUID;
  v_amount      NUMERIC(14,2);
  v_method      TEXT;
  v_status      TEXT;
  v_tx_type     TEXT;
  v_balance     NUMERIC(14,2);
  v_held        NUMERIC(14,2);
BEGIN
  SELECT customer_id, amount, method, status
  INTO   v_customer_id, v_amount, v_method, v_status
  FROM   partner_payout_requests
  WHERE  id = p_payout_id
  FOR    UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Заявку не знайдено');
  END IF;
  IF v_status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', format('Заявка вже оброблена (статус: %s)', v_status));
  END IF;

  SELECT balance, balance_held INTO v_balance, v_held
  FROM customers WHERE id = v_customer_id FOR UPDATE;

  -- Сума заявки вже в резерві, тож вистачає, якщо сам баланс її покриває.
  IF v_balance < v_amount THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('Баланс партнера (%s ₴) менший за суму заявки (%s ₴)', round(v_balance, 2), v_amount));
  END IF;

  v_tx_type := CASE WHEN v_method = 'goods_offset' THEN 'goods_offset' ELSE 'payout' END;

  INSERT INTO partner_balance_transactions (customer_id, tx_type, amount, description, created_by)
  VALUES (v_customer_id, v_tx_type, -v_amount, format('Виплата підтверджена: %s', p_admin_email), p_admin_email);

  -- GREATEST: заявки, подані до цієї міграції, резерву не мали.
  UPDATE customers SET balance_held = GREATEST(0, balance_held - v_amount) WHERE id = v_customer_id;

  UPDATE partner_payout_requests
  SET status = 'approved', processed_at = NOW(), processed_by = p_admin_email
  WHERE id = p_payout_id;

  RETURN jsonb_build_object('success', true, 'tx_type', v_tx_type, 'amount', v_amount);
END;
$func$;


CREATE OR REPLACE FUNCTION reject_payout(
  p_payout_id   UUID,
  p_admin_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $func$
DECLARE
  v_customer_id UUID;
  v_amount      NUMERIC(14,2);
  v_status      TEXT;
BEGIN
  SELECT customer_id, amount, status
  INTO   v_customer_id, v_amount, v_status
  FROM   partner_payout_requests
  WHERE  id = p_payout_id
  FOR    UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Заявку не знайдено');
  END IF;
  IF v_status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', format('Заявка вже оброблена (статус: %s)', v_status));
  END IF;

  UPDATE customers SET balance_held = GREATEST(0, balance_held - v_amount) WHERE id = v_customer_id;

  UPDATE partner_payout_requests
  SET status = 'rejected', processed_at = NOW(), processed_by = p_admin_email
  WHERE id = p_payout_id;

  RETURN jsonb_build_object('success', true);
END;
$func$;

REVOKE EXECUTE ON FUNCTION submit_payout_request(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION approve_payout(UUID, TEXT)                      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION reject_payout(UUID, TEXT)                       FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION submit_payout_request(UUID, NUMERIC, TEXT, TEXT) TO service_role;
GRANT  EXECUTE ON FUNCTION approve_payout(UUID, TEXT)                      TO service_role;
GRANT  EXECUTE ON FUNCTION reject_payout(UUID, TEXT)                       TO service_role;
