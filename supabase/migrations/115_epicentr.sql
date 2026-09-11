-- ============================================================
-- Маркетплейс Епіцентр (epicentrm.com.ua) — канал продажу, замовлення, ціни
-- ============================================================
--
-- Дзеркало Prom/Rozetka: канал у sales_channels, зовнішній id + сирий payload
-- на orders, прапорець участі й націнка на products, комісія/націнка/код
-- категорії Епіцентру на categories.
--
-- Ідентифікатор замовлення в Епіцентрі — UUID (а не число, як у Prom/Rozetka),
-- тому колонка TEXT; людський номер замовлення лежить у epicentr_data->>'number'.

INSERT INTO sales_channels (code, name, type, sort_order) VALUES
  ('epicentr', 'Епіцентр', 'marketplace', 80)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS epicentr_order_id TEXT,
  ADD COLUMN IF NOT EXISTS epicentr_data     JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS orders_epicentr_order_id_key
  ON orders (epicentr_order_id)
  WHERE epicentr_order_id IS NOT NULL;

-- Участь товару в Епіцентрі і товарний override націнки (як on_prom / prom_markup_pct).
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS on_epicentr         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS epicentr_markup_pct NUMERIC(6,2);

-- Комісія й націнка категорії для Епіцентру + код категорії з дерева Епіцентру
-- (<category code="…"> у фіді; довідник — Google-таблиця з кабінету продавця).
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS epicentr_commission_pct NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS epicentr_markup_pct     NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS epicentr_category_code  TEXT;

COMMENT ON COLUMN orders.epicentr_order_id IS 'UUID замовлення в Merchant API Епіцентру; номер для людей — epicentr_data->>''number''';
COMMENT ON COLUMN orders.epicentr_data     IS 'Сирий payload замовлення з /v4/oms/orders + _commission (знімок розрахунку комісії)';
COMMENT ON COLUMN categories.epicentr_category_code IS 'Код категорії з дерева категорій Епіцентру (атрибут code у <category> фіда)';
