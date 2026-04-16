-- ============================================================
-- FixHub — початкова схема бази даних
-- ============================================================

-- ── Категорії ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id          SERIAL      PRIMARY KEY,
  slug        TEXT        UNIQUE NOT NULL,
  name        TEXT        NOT NULL,
  sort_order  INT         DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Товари (каталог — ведеться вами) ─────────────────────────
-- Містить статичну інформацію: назва, опис, фото, характеристики
-- Змінюється рідко, оновлюється вручну через Excel-імпорт
CREATE TABLE IF NOT EXISTS products (
  id            SERIAL      PRIMARY KEY,
  sku           TEXT        UNIQUE NOT NULL,  -- головний ідентифікатор для синхронізації
  name          TEXT        NOT NULL,
  brand         TEXT        NOT NULL,
  category_slug TEXT        REFERENCES categories(slug),
  product_type  TEXT,                         -- Акриловий, Силіконовий, тощо
  color         TEXT,
  volume        TEXT,
  pack_qty      INT         NOT NULL DEFAULT 1,
  min_order     INT         NOT NULL DEFAULT 1,
  description   TEXT,
  image         TEXT,                         -- шлях: /products/назва-файлу.jpg
  nl1           TEXT,                         -- перший рядок SVG-заглушки
  nl2           TEXT,                         -- другий рядок SVG-заглушки
  bc            TEXT        DEFAULT '#4A6080', -- колір тіла SVG
  ac            TEXT        DEFAULT '#2A4060', -- колір акценту SVG
  img_type      TEXT        DEFAULT 'tube',   -- tube | canister
  is_active     BOOLEAN     DEFAULT true,
  sort_order    INT         DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Характеристики товарів ────────────────────────────────────
-- Окрема таблиця для гнучкості: у кожного товару своя кількість рядків
CREATE TABLE IF NOT EXISTS product_characteristics (
  id          SERIAL  PRIMARY KEY,
  product_sku TEXT    NOT NULL REFERENCES products(sku) ON DELETE CASCADE,
  label       TEXT    NOT NULL,  -- "Об'єм", "Тип", "Колір", тощо
  value       TEXT    NOT NULL,  -- "650 мл", "Акриловий", тощо
  sort_order  INT     DEFAULT 0
);

-- ── Залишки та ціни (динаміка — синхронізується з постачальником) ──
-- Ця таблиця оновлюється автоматично скриптом синхронізації
-- НЕ редагується вручну в нормальному режимі
CREATE TABLE IF NOT EXISTS product_stock (
  id            SERIAL       PRIMARY KEY,
  sku           TEXT         UNIQUE NOT NULL REFERENCES products(sku) ON DELETE CASCADE,
  price_unit    NUMERIC(12,2) NOT NULL DEFAULT 0,
  price_old     NUMERIC(12,2),          -- якщо є знижка — попередня ціна
  stock_qty     INT          NOT NULL DEFAULT 0,
  stock_status  TEXT         NOT NULL DEFAULT 'in_stock',
  -- in_stock | out_of_stock | on_order (під замовлення)
  supplier_sku  TEXT,                   -- артикул постачальника в його системі
  updated_at    TIMESTAMPTZ  DEFAULT NOW()
);

-- ── Лог синхронізацій ─────────────────────────────────────────
-- Зберігає історію всіх запусків скриптів синхронізації
CREATE TABLE IF NOT EXISTS sync_log (
  id               SERIAL      PRIMARY KEY,
  source           TEXT        NOT NULL,  -- 'excel', '1c_xml', '1c_csv', 'api'
  status           TEXT        NOT NULL,  -- 'success', 'error', 'partial'
  records_total    INT         DEFAULT 0,
  records_updated  INT         DEFAULT 0,
  records_skipped  INT         DEFAULT 0,
  error_details    TEXT,
  started_at       TIMESTAMPTZ DEFAULT NOW(),
  finished_at      TIMESTAMPTZ
);

-- ── Індекси ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_slug);
CREATE INDEX IF NOT EXISTS idx_products_brand    ON products(brand);
CREATE INDEX IF NOT EXISTS idx_products_active   ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_stock_sku         ON product_stock(sku);
CREATE INDEX IF NOT EXISTS idx_chars_sku         ON product_characteristics(product_sku);

-- ── Тригер: автоматично оновлює updated_at ────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER stock_updated_at
  BEFORE UPDATE ON product_stock
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Початкові дані: категорії ─────────────────────────────────
INSERT INTO categories (slug, name, sort_order) VALUES
  ('germetyky',     'Герметики',     1),
  ('montazhni-piny','Монтажні піни', 2),
  ('ridki-tsviakhy','Рідкі цвяхи',  3),
  ('klei',          'Клеї',          4),
  ('gruntovky',     'Ґрунтовки',     5),
  ('strichky',      'Стрічки',       6)
ON CONFLICT (slug) DO NOTHING;
