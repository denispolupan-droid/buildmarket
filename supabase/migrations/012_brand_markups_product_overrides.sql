-- ============================================================
-- Наценки по брендах + override цін на окремі товари
-- ============================================================

-- ── 1. Наценки на бренди ──────────────────────────────────────────────────────
--
-- Розширює існуючу таблицю supplier_brand_discounts:
--   discount_pct    — знижує вхідну ціну (вже була)
--   markup_retail   — наценка магазин для цього бренду (NULL = глобальна)
--   markup_wholesale — наценка опт/каталог (NULL = глобальна)
--   markup_drop     — наценка дроп (NULL = глобальна)

ALTER TABLE supplier_brand_discounts
  ADD COLUMN IF NOT EXISTS markup_retail    NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS markup_wholesale NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS markup_drop      NUMERIC(5,2);


-- ── 2. Override цін на окремі товари ─────────────────────────────────────────
--
-- Найвищий пріоритет — перекриває наценку бренду і постачальника.
--
-- Варіанти (заповнити одне або кілька):
--   markup_*  — % наценки для цього SKU (NULL = не використовувати)
--   fixed_*   — фіксована ціна (NULL = рахувати через наценку)
--
-- Якщо є fixed_retail — використовується напряму, markup ігнорується.

CREATE TABLE IF NOT EXISTS supplier_product_overrides (
  supplier_id       INT           NOT NULL REFERENCES suppliers(id)  ON DELETE CASCADE,
  our_sku           TEXT          NOT NULL REFERENCES products(sku)  ON DELETE CASCADE,

  -- Наценка % (перекриває бренд і постачальника)
  markup_retail     NUMERIC(5,2),
  markup_wholesale  NUMERIC(5,2),
  markup_drop       NUMERIC(5,2),

  -- Фіксована ціна (перекриває все, включно з наценкою)
  fixed_retail      NUMERIC(12,2),
  fixed_wholesale   NUMERIC(12,2),
  fixed_drop        NUMERIC(12,2),

  notes             TEXT,
  updated_at        TIMESTAMPTZ   DEFAULT NOW(),

  PRIMARY KEY (supplier_id, our_sku)
);

CREATE INDEX IF NOT EXISTS idx_product_overrides_supplier
  ON supplier_product_overrides(supplier_id);

CREATE TRIGGER trg_product_overrides_updated_at
  BEFORE UPDATE ON supplier_product_overrides
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE supplier_product_overrides ENABLE ROW LEVEL SECURITY;
