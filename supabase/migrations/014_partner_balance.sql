-- ============================================================
-- Баланс дропшип-партнерів
-- ============================================================
--
-- Логіка:
--   Партнер поповнює баланс (top_up)
--   При оформленні замовлення: списується закупочна ціна (charge)
--   Після доставки та отримання COD: нараховується заробіток (cod_credit)
--   Комісія НП списується окремо (np_fee)
--   Повернення: повертається закупочна, списується вартість зворотної доставки (return)
--   Виведення: payout або залік товаром (goods_offset)
--
-- tx_type:
--   top_up       — поповнення балансу (партнер переказав)
--   charge       — списання закупочної ціни при оформленні замовлення
--   cod_credit   — нарахування суми COD після доставки
--   np_fee       — комісія Нової Пошти за COD (~2%)
--   return_refund— повернення закупочної при поверненні товару
--   return_fee   — вартість зворотної доставки (списання)
--   payout       — виплата партнеру (банківський переказ)
--   goods_offset — товарний залік (покупка товару за рахунок балансу)
--   adjustment   — ручне коригування (адміністратор)
-- ============================================================

CREATE TABLE IF NOT EXISTS partner_balance_transactions (
  id            BIGSERIAL     PRIMARY KEY,
  customer_id   UUID          NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  tx_type       TEXT          NOT NULL CHECK (tx_type IN (
                  'top_up','charge','cod_credit','np_fee',
                  'return_refund','return_fee','payout','goods_offset','adjustment'
                )),
  amount        NUMERIC(14,2) NOT NULL,              -- > 0 = нарахування, < 0 = списання
  balance_after NUMERIC(14,2),                       -- баланс після транзакції (для аудиту)
  order_id      UUID,                                -- → orders.id
  description   TEXT          NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_by    TEXT                                 -- email адміна або 'system'
);

CREATE INDEX IF NOT EXISTS idx_pbt_customer
  ON partner_balance_transactions(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pbt_order
  ON partner_balance_transactions(order_id) WHERE order_id IS NOT NULL;

ALTER TABLE partner_balance_transactions ENABLE ROW LEVEL SECURITY;

-- ── Поточний баланс (денормалізований для швидкого доступу) ───────────────────
-- Оновлюється тригером при кожній транзакції

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS balance        NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_held   NUMERIC(14,2) NOT NULL DEFAULT 0;
  -- balance_held = зарезервовано під активні замовлення (ще не доставлені)

-- ── Тригер: оновлює balance після кожної транзакції ───────────────────────────

CREATE OR REPLACE FUNCTION fn_update_partner_balance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_new_balance NUMERIC(14,2);
BEGIN
  UPDATE customers
  SET balance = balance + NEW.amount
  WHERE id = NEW.customer_id
  RETURNING balance INTO v_new_balance;

  -- Зберігаємо баланс після транзакції для аудиту
  UPDATE partner_balance_transactions
  SET balance_after = v_new_balance
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_partner_balance
  AFTER INSERT ON partner_balance_transactions
  FOR EACH ROW EXECUTE FUNCTION fn_update_partner_balance();

-- ── Заявки на виведення коштів ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS partner_payout_requests (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   UUID          NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount        NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  method        TEXT          NOT NULL DEFAULT 'bank'
                  CHECK (method IN ('bank','goods_offset')),
  bank_details  TEXT,                   -- реквізити для переказу
  status        TEXT          NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','paid','rejected')),
  notes         TEXT,
  requested_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  processed_at  TIMESTAMPTZ,
  processed_by  TEXT
);

CREATE INDEX IF NOT EXISTS idx_payout_requests_customer
  ON partner_payout_requests(customer_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_payout_requests_pending
  ON partner_payout_requests(status, requested_at)
  WHERE status = 'pending';

ALTER TABLE partner_payout_requests ENABLE ROW LEVEL SECURITY;

-- ── qty_is_flag на постачальниках (якщо ще не застосована міграція) ───────────

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS qty_is_flag BOOLEAN DEFAULT false;
