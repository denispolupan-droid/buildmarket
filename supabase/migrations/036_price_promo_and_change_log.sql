-- ── 036: price_promo field + price_change_log journal ────────────────────────

-- Акційна ціна на товар (коли встановлена — сайт показує price_retail як "стару",
-- price_promo як нову акційну)
ALTER TABLE product_stock
  ADD COLUMN IF NOT EXISTS price_promo numeric;

-- Журнал переоцінок
CREATE TABLE IF NOT EXISTS price_change_log (
  id          bigserial PRIMARY KEY,
  created_at  timestamptz DEFAULT now(),
  user_id     uuid REFERENCES auth.users ON DELETE SET NULL,
  type        text NOT NULL,        -- 'multiply_cost' | 'increase_pct' | 'fixed'
  value       numeric NOT NULL,
  target      text NOT NULL,        -- 'retail' | 'unit' | 'drop' | 'all'
  is_promo    boolean DEFAULT false,
  comment     text,
  revert_at   date,
  count       int,
  snapshot    jsonb                 -- [{sku, name, before:{unit,retail,drop}, after:{unit,retail,drop}}]
);

-- RLS: тільки адміни
ALTER TABLE price_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all" ON price_change_log
  USING (auth.jwt() ->> 'role' = 'admin' OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
  WITH CHECK (auth.jwt() ->> 'role' = 'admin' OR (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');
