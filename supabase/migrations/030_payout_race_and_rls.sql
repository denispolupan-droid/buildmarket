-- ============================================================
-- 1. Атомарна подача заявки на виплату
-- ============================================================
--
-- Проблема: cabinet/payout/route.ts читає баланс без блокування,
-- два паралельних запити проходять перевірку і обидва подають заявки,
-- потенційно перевищуючи доступний залишок.
--
-- Рішення: SELECT FOR UPDATE на customers блокує рядок.
-- Другий паралельний виклик чекає завершення першого.
-- ============================================================

CREATE OR REPLACE FUNCTION submit_payout_request(
  p_auth_user_id UUID,
  p_amount       NUMERIC(14,2),
  p_method       TEXT,          -- 'bank' | 'goods_offset'
  p_bank_details TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_customer_id UUID;
  v_balance     NUMERIC(14,2);
  v_held        NUMERIC(14,2);
  v_available   NUMERIC(14,2);
BEGIN
  IF p_amount < 500 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Мінімальна сума — 500 грн');
  END IF;

  IF p_method NOT IN ('bank', 'goods_offset') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Невірний метод виплати');
  END IF;

  IF p_method = 'bank' AND (p_bank_details IS NULL OR trim(p_bank_details) = '') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Вкажіть реквізити');
  END IF;

  -- Блокуємо рядок customers → паралельні запити чекатимуть
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
    RETURN jsonb_build_object(
      'success', false,
      'error', format(
        'Недостатньо коштів. Доступно: %s ₴',
        round(v_available, 2)
      )
    );
  END IF;

  -- Перевіряємо що немає вже активної заявки на ту ж суму (захист від double-click)
  IF EXISTS (
    SELECT 1 FROM partner_payout_requests
    WHERE  customer_id = v_customer_id
      AND  status      = 'pending'
      AND  amount      = p_amount
      AND  requested_at > NOW() - INTERVAL '60 seconds'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Аналогічна заявка вже подана (зачекайте хвилину)');
  END IF;

  INSERT INTO partner_payout_requests
    (customer_id, amount, method, bank_details, status)
  VALUES
    (v_customer_id, p_amount, p_method, p_bank_details, 'pending');

  RETURN jsonb_build_object('success', true, 'available_after', v_available - p_amount);
END;
$func$;


-- ============================================================
-- 2. RLS-policies
-- ============================================================
--
-- Принцип:
--   a) Бухгалтерські таблиці (008) — суто внутрішні.
--      Весь доступ — через service_role з бекенду.
--      Explicit USING (false) для anon/authenticated:
--      - Документує намір (не "забули додати" а "свідомо заборонено")
--      - service_role ці POLICY ігнорує (завжди bypass)
--
--   b) Партнерські таблиці (014) — партнер читає своє.
--      customer_id прив'язаний до auth.uid() через customers.auth_user_id.
--      INSERT/UPDATE — тільки через SQL-функції (SECURITY DEFINER), не напряму.
-- ============================================================

-- ── a) Бухгалтерські таблиці: deny all (крім service_role) ───────────────────

DO $body$
DECLARE
  tbl TEXT;
  internal_tables TEXT[] := ARRAY[
    'acc_doc_types',
    'acc_expense_categories',
    'acc_payment_methods',
    'warehouses',
    'acc_documents',
    'acc_document_lines',
    'stock_movements',
    'stock_balance',
    'stock_reservations',
    'price_history',
    'acc_payments',
    'acc_expenses',
    'acc_doc_sequences'
  ];
BEGIN
  FOREACH tbl IN ARRAY internal_tables LOOP
    -- Видаляємо старі policies якщо були
    EXECUTE format('DROP POLICY IF EXISTS deny_all ON %I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS internal_only ON %I', tbl);

    -- Explicit deny-all для всіх ролей крім service_role
    EXECUTE format(
      'CREATE POLICY internal_only ON %I USING (false)',
      tbl
    );
  END LOOP;
END;
$body$;


-- ── b) partner_balance_transactions: партнер читає своє ──────────────────────

DROP POLICY IF EXISTS partner_read_own    ON partner_balance_transactions;
DROP POLICY IF EXISTS partner_no_write    ON partner_balance_transactions;

-- Читання: тільки свої транзакції
CREATE POLICY partner_read_own ON partner_balance_transactions
  FOR SELECT
  USING (
    customer_id = (
      SELECT id FROM customers
      WHERE auth_user_id = auth.uid()
    )
  );

-- Запис: заборонений напряму (тільки через SQL-функції charge/refund/credit)
CREATE POLICY partner_no_write ON partner_balance_transactions
  FOR ALL
  USING (false)
  WITH CHECK (false);


-- ── c) partner_payout_requests: партнер читає своє, подає через функцію ──────

DROP POLICY IF EXISTS partner_read_own ON partner_payout_requests;
DROP POLICY IF EXISTS partner_no_write ON partner_payout_requests;

CREATE POLICY partner_read_own ON partner_payout_requests
  FOR SELECT
  USING (
    customer_id = (
      SELECT id FROM customers
      WHERE auth_user_id = auth.uid()
    )
  );

-- Запис: тільки через submit_payout_request (SECURITY DEFINER)
CREATE POLICY partner_no_write ON partner_payout_requests
  FOR ALL
  USING (false)
  WITH CHECK (false);
