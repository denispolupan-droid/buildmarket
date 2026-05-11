-- Брошенные корзины — для email-ремайндеров
CREATE TABLE IF NOT EXISTS abandoned_carts (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT          NOT NULL,
  user_id         UUID,
  items           JSONB         NOT NULL DEFAULT '[]',
  total_price     NUMERIC(14,2) NOT NULL DEFAULT 0,
  recover_token   UUID          NOT NULL DEFAULT gen_random_uuid(),
  reminder_1_at   TIMESTAMPTZ,  -- 1 час
  reminder_2_at   TIMESTAMPTZ,  -- 24 часа
  reminder_3_at   TIMESTAMPTZ,  -- 72 часа (3 дня)
  recovered_at    TIMESTAMPTZ,  -- когда оформили заказ
  last_seen_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_abandoned_carts_token  ON abandoned_carts(recover_token);
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_email  ON abandoned_carts(email) WHERE recovered_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_remind ON abandoned_carts(last_seen_at) WHERE recovered_at IS NULL;

ALTER TABLE abandoned_carts ENABLE ROW LEVEL SECURITY;
