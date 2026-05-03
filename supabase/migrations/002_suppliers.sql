-- ── Поставщики ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS suppliers (
  id                 SERIAL        PRIMARY KEY,
  slug               TEXT          UNIQUE NOT NULL,
  name               TEXT          NOT NULL,
  source_url         TEXT,                        -- URL для скачивания файла
  file_format        TEXT          NOT NULL DEFAULT 'csv',  -- csv | xls | 1c_xml
  sync_interval_h    INT           NOT NULL DEFAULT 24,     -- периодичность в часах
  last_synced_at     TIMESTAMPTZ,
  markup_retail      NUMERIC(5,2)  NOT NULL DEFAULT 22,     -- наценка магазин %
  markup_wholesale   NUMERIC(5,2)  NOT NULL DEFAULT 10,     -- наценка опт/каталог %
  markup_drop        NUMERIC(5,2)  NOT NULL DEFAULT 15,     -- наценка дроп %
  is_active          BOOLEAN       NOT NULL DEFAULT true,
  notes              TEXT,
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── Скидки поставщика на бренды ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS supplier_brand_discounts (
  id             SERIAL        PRIMARY KEY,
  supplier_id    INT           NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  brand          TEXT          NOT NULL,
  discount_pct   NUMERIC(5,2)  NOT NULL DEFAULT 0,
  UNIQUE (supplier_id, brand)
);

-- ── Маппинг артикулов поставщика → наши SKU ──────────────────────────────────

CREATE TABLE IF NOT EXISTS supplier_sku_map (
  supplier_id    INT   NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  supplier_sku   TEXT  NOT NULL,
  our_sku        TEXT  NOT NULL REFERENCES products(sku) ON DELETE CASCADE,
  PRIMARY KEY (supplier_id, supplier_sku)
);

CREATE INDEX IF NOT EXISTS idx_sku_map_our_sku ON supplier_sku_map(our_sku);

-- ── Лог синхронизаций поставщиков ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS supplier_sync_log (
  id               SERIAL      PRIMARY KEY,
  supplier_id      INT         NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at      TIMESTAMPTZ,
  rows_total       INT         NOT NULL DEFAULT 0,
  rows_updated     INT         NOT NULL DEFAULT 0,
  rows_skipped     INT         NOT NULL DEFAULT 0,
  rows_unmapped    INT         NOT NULL DEFAULT 0,
  error_message    TEXT
);

CREATE INDEX IF NOT EXISTS idx_supplier_sync_log_supplier ON supplier_sync_log(supplier_id, started_at DESC);

-- ── Немаплённые артикулы поставщика ──────────────────────────────────────────
-- Накапливаются при синхронизации, очищаются после маппинга

CREATE TABLE IF NOT EXISTS supplier_unmapped_skus (
  supplier_id    INT         NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  supplier_sku   TEXT        NOT NULL,
  sample_name    TEXT,                  -- название товара из файла (для подсказки)
  price_in       NUMERIC(12,2),
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (supplier_id, supplier_sku)
);

-- ── RLS: только service_role имеет доступ к таблицам поставщиков ──────────────

ALTER TABLE suppliers               ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_brand_discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_sku_map        ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_sync_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_unmapped_skus  ENABLE ROW LEVEL SECURITY;
