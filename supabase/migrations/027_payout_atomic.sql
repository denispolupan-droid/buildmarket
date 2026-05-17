-- ============================================================
-- Атомарне підтвердження виплати партнеру
-- ============================================================
-- Проблема: попередній код робив два окремих запити:
--   1. INSERT INTO partner_balance_transactions  ← баланс списаний
--   2. UPDATE partner_payout_requests status     ← може впасти
--   Результат: баланс списаний, заявка залишається pending → дублікат виплати.
--
-- Рішення: одна транзакція в SQL-функції.
-- Додатково перевіряємо що заявка ще pending (idempotent).
-- ============================================================

CREATE OR REPLACE FUNCTION approve_payout(
  p_payout_id   UUID,
  p_admin_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_customer_id UUID;
  v_amount      NUMERIC(14,2);
  v_method      TEXT;
  v_status      TEXT;
  v_tx_type     TEXT;
BEGIN
  -- Блокуємо рядок і перевіряємо статус
  SELECT customer_id, amount, method, status
  INTO   v_customer_id, v_amount, v_method, v_status
  FROM   partner_payout_requests
  WHERE  id = p_payout_id
  FOR    UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Заявку не знайдено');
  END IF;

  IF v_status <> 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Заявка вже оброблена (статус: %s)', v_status)
    );
  END IF;

  v_tx_type := CASE WHEN v_method = 'goods_offset' THEN 'goods_offset' ELSE 'payout' END;

  -- Списуємо баланс
  INSERT INTO partner_balance_transactions
    (customer_id, tx_type, amount, description, created_by)
  VALUES
    (v_customer_id, v_tx_type, -v_amount,
     format('Виплата підтверджена: %s', p_admin_email),
     p_admin_email);

  -- Оновлюємо статус заявки в тій самій транзакції
  UPDATE partner_payout_requests
  SET    status       = 'approved',
         processed_at = NOW(),
         processed_by = p_admin_email
  WHERE  id = p_payout_id;

  RETURN jsonb_build_object('success', true, 'tx_type', v_tx_type, 'amount', v_amount);
END;
$$;


-- ============================================================
-- Функція звірки балансу (інваріант)
-- ============================================================
-- Викликати після підозрілих операцій або в cron.
-- Повертає розбіжність для кожного партнера де sum ≠ balance.
-- ============================================================

CREATE OR REPLACE FUNCTION check_balance_integrity()
RETURNS TABLE (
  customer_id   UUID,
  stored_balance   NUMERIC(14,2),
  computed_balance NUMERIC(14,2),
  drift            NUMERIC(14,2)
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    c.id                                              AS customer_id,
    c.balance                                         AS stored_balance,
    COALESCE(SUM(t.amount), 0)                        AS computed_balance,
    c.balance - COALESCE(SUM(t.amount), 0)            AS drift
  FROM customers c
  LEFT JOIN partner_balance_transactions t ON t.customer_id = c.id
  GROUP BY c.id, c.balance
  HAVING ABS(c.balance - COALESCE(SUM(t.amount), 0)) > 0.005;
$$;
