-- Журнал сповіщень покупцю (Viber/SMS про рух замовлення).
--
-- Унікальність (order_id, event) — не оптимізація, а захист від дублів: крон
-- доставки бачить ту саму подію в кожному прогоні, і без цього обмеження людина
-- отримувала б «посилка прибула» щопівгодини. Клейм рядка ПЕРЕД відправкою
-- робить перевірку атомарною навіть коли два прогони збіглися.
--
-- Тут же й аудит: скільки повідомлень пішло, які впали і чому — інакше витрати
-- на SMS неможливо ні пояснити, ні перевірити.

CREATE TABLE IF NOT EXISTS customer_notifications (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            uuid        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event               text        NOT NULL,           -- shipped | arrived | pickup_reminder
  channel             text,                           -- viber | sms (чим доставлено)
  phone               text        NOT NULL,
  body                text        NOT NULL,
  status              text        NOT NULL DEFAULT 'pending',  -- pending | sent | failed | skipped
  provider            text,
  provider_message_id text,
  error               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  sent_at             timestamptz,
  UNIQUE (order_id, event)
);

CREATE INDEX IF NOT EXISTS idx_customer_notifications_created
  ON customer_notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_notifications_status
  ON customer_notifications (status) WHERE status <> 'sent';

COMMENT ON TABLE customer_notifications IS
  'Сповіщення покупцю про рух замовлення. UNIQUE(order_id,event) гарантує «одна подія — одне повідомлення».';
