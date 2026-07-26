-- Заявки на повернення з маркетплейсів (Rozetka /order-refund/search; Prom окремих
-- заявок не має — там повернення видно лише як скасування замовлення).
-- Таблицю веде cron-вотчер: upsert по (marketplace, refund_id), алерт на нову заявку
-- і на зміну статусу. Доступ лише через service role (RLS без політик).
CREATE TABLE IF NOT EXISTS marketplace_refunds (
  marketplace   TEXT        NOT NULL,                                   -- 'rozetka'
  refund_id     TEXT        NOT NULL,                                   -- id заявки на площадці
  mp_order_id   BIGINT,                                                 -- id замовлення на площадці
  order_id      UUID        REFERENCES orders(id) ON DELETE SET NULL,   -- наше замовлення (якщо знайдено)
  status_code   TEXT,
  status_title  TEXT,
  reason_title  TEXT,
  item_name     TEXT,
  ttn           TEXT,                                                   -- ТТН зворотної доставки
  opened_at     TIMESTAMPTZ,                                            -- datetime заявки на площадці
  raw           JSONB,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (marketplace, refund_id)
);
CREATE INDEX IF NOT EXISTS idx_marketplace_refunds_order ON marketplace_refunds(order_id);
ALTER TABLE marketplace_refunds ENABLE ROW LEVEL SECURITY;

-- Денормалізований прапорець на замовленні для списку/картки в адмінці:
-- NULL = відкритих заявок нема; інакше — status_title поточної заявки.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS mp_refund_status TEXT;
