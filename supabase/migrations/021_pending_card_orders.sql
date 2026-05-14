-- Временная таблица для хранения черновиков карточных заказов до подтверждения оплаты.
-- В таблицу orders попадает только после успешного вебхука от Monobank.

CREATE TABLE IF NOT EXISTS pending_card_orders (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  payload     jsonb       NOT NULL,
  reference   text        UNIQUE NOT NULL,
  total_price numeric(14,2) NOT NULL,
  email       text,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_card_orders_reference  ON pending_card_orders(reference);
CREATE INDEX IF NOT EXISTS idx_pending_card_orders_created_at ON pending_card_orders(created_at);

-- Удаляем существующие "висящие" заказы без оплаты
DELETE FROM orders WHERE status = 'pending_payment';

-- Очистка черновиков старше 24ч (Monobank invoice TTL = 24h)
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cleanup-pending-card-orders';

SELECT cron.schedule(
  'cleanup-pending-card-orders',
  '*/30 * * * *',
  $$
    DELETE FROM pending_card_orders
    WHERE created_at < now() - interval '24 hours';
  $$
);
