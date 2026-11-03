-- 153: marketplace_orders — staging імпорту площадок (аудит 31.10.2026, п. 17).
-- Таблиця з 009 стояла порожньою: FK на marketplace_accounts (теж порожня), а
-- синки писали сирий payload лише в orders.prom_data/rozetka_data/epicentr_data.
-- Тепер import-order.ts кладе сюди кожну ПЕРШУ зустріч замовлення площадки:
-- сирий payload, результат (created / skipped / error) і текст помилки — щоб
-- відмову імпорту було видно й можна було переграти з того самого payload.
-- Повторні тики крону («exists») сюди не пишуть — бережемо IO (Supabase nano).

ALTER TABLE marketplace_orders
  DROP CONSTRAINT IF EXISTS marketplace_orders_marketplace_id_fkey,
  DROP CONSTRAINT IF EXISTS marketplace_orders_marketplace_id_external_order_id_key;
DROP INDEX IF EXISTS idx_mp_orders_marketplace;
DROP INDEX IF EXISTS idx_mp_orders_pending;

ALTER TABLE marketplace_orders
  DROP COLUMN IF EXISTS marketplace_id,
  ADD COLUMN IF NOT EXISTS marketplace TEXT NOT NULL
    CHECK (marketplace IN ('prom', 'rozetka', 'epicentr')),
  ADD COLUMN IF NOT EXISTS result TEXT NOT NULL DEFAULT 'created'
    CHECK (result IN ('created', 'skipped', 'error')),
  ALTER COLUMN status_external SET DEFAULT '';

ALTER TABLE marketplace_orders
  ADD CONSTRAINT marketplace_orders_marketplace_external_key UNIQUE (marketplace, external_order_id);

-- Замовлення видалили — staging-рядок лишається як слід, без прив'язки
ALTER TABLE marketplace_orders
  DROP CONSTRAINT IF EXISTS marketplace_orders_our_order_id_fkey,
  ADD CONSTRAINT marketplace_orders_our_order_id_fkey
    FOREIGN KEY (our_order_id) REFERENCES orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mp_orders_marketplace ON marketplace_orders (marketplace, imported_at DESC);
-- Відмови імпорту — те, що треба бачити й переграти
CREATE INDEX IF NOT EXISTS idx_mp_orders_errors ON marketplace_orders (marketplace, imported_at DESC)
  WHERE result = 'error';

-- RLS уже ввімкнено без політик; гранти anon/authenticated з 009 — зайві
REVOKE ALL ON marketplace_orders FROM anon, authenticated;

COMMENT ON TABLE marketplace_orders IS
  'Staging імпорту замовлень площадок: перша зустріч кожного зовнішнього замовлення з сирим payload і результатом (import-order.ts).';
