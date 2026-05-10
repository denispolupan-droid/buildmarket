-- ============================================================
-- Атомарні операції з балансом партнера
-- ============================================================
--
-- Проблема без цих функцій:
--   Два паралельних запити можуть одночасно перевірити баланс,
--   обидва побачать що коштів вистачає, і обидва спишуть —
--   баланс піде в мінус.
--
-- Рішення — SELECT FOR UPDATE:
--   Функція блокує рядок customers на час виконання.
--   Другий запит чекає поки перший завершиться.
--   Перевірка і списання відбуваються атомарно.
-- ============================================================


-- ── Списання балансу (атомарне) ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION charge_partner_balance(
  p_customer_id   UUID,
  p_amount        NUMERIC,
  p_order_id      UUID    DEFAULT NULL,
  p_description   TEXT    DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance   NUMERIC;
  v_held      NUMERIC;
  v_available NUMERIC;
BEGIN
  -- Блокуємо рядок: інші запити чекатимуть поки ця транзакція завершиться
  SELECT balance, balance_held
  INTO   v_balance, v_held
  FROM   customers
  WHERE  id = p_customer_id
  FOR    UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Партнера не знайдено');
  END IF;

  v_available := v_balance - v_held;

  IF v_available < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   format(
        'Недостатньо балансу. Доступно: %s ₴, потрібно: %s ₴',
        round(v_available, 2), round(p_amount, 2)
      )
    );
  END IF;

  -- Вставляємо транзакцію — тригер trg_update_partner_balance
  -- автоматично оновить customers.balance
  INSERT INTO partner_balance_transactions
    (customer_id, tx_type, amount, order_id, description, created_by)
  VALUES
    (p_customer_id, 'charge', -p_amount, p_order_id, p_description, 'system');

  RETURN jsonb_build_object('success', true);
END;
$$;


-- ── Повернення балансу (при помилці НП або скасуванні) ────────────────────────

CREATE OR REPLACE FUNCTION refund_partner_balance(
  p_customer_id   UUID,
  p_amount        NUMERIC,
  p_order_id      UUID    DEFAULT NULL,
  p_description   TEXT    DEFAULT 'Повернення коштів'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO partner_balance_transactions
    (customer_id, tx_type, amount, order_id, description, created_by)
  VALUES
    (p_customer_id, 'return_refund', p_amount, p_order_id, p_description, 'system');

  RETURN jsonb_build_object('success', true);
END;
$$;


-- ── Нарахування COD після доставки ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION credit_cod_to_partner(
  p_customer_id   UUID,
  p_cod_amount    NUMERIC,     -- сума яку отримали від НП
  p_np_fee_pct    NUMERIC DEFAULT 2,  -- комісія НП у %
  p_order_id      UUID    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_np_fee    NUMERIC;
  v_credit    NUMERIC;
BEGIN
  v_np_fee := round(p_cod_amount * p_np_fee_pct / 100, 2);
  v_credit  := p_cod_amount - v_np_fee;

  -- Нарахування COD
  INSERT INTO partner_balance_transactions
    (customer_id, tx_type, amount, order_id, description, created_by)
  VALUES
    (p_customer_id, 'cod_credit', p_credit, p_order_id,
     format('COD отримано: %s ₴', p_cod_amount), 'system');

  -- Комісія НП
  INSERT INTO partner_balance_transactions
    (customer_id, tx_type, amount, order_id, description, created_by)
  VALUES
    (p_customer_id, 'np_fee', -v_np_fee, p_order_id,
     format('Комісія НП %s%%: %s ₴', p_np_fee_pct, v_np_fee), 'system');

  RETURN jsonb_build_object(
    'success',  true,
    'credited', v_credit,
    'np_fee',   v_np_fee
  );
END;
$$;
