-- ============================================================
-- Акційні ціни постачальників
-- ============================================================
--
-- Акція може бути на:
--   - конкретний товар (our_sku)
--   - весь бренд (brand)
--   - всі товари постачальника (обидва NULL)
--
-- Типи акцій:
--   percent       — знижка % від розрахованої ціни (80,00 − 20% = 64,00)
--   fixed_price   — нова фіксована ціна (ігнорує наценку)
--   fixed_discount — знижка в грн (80,00 − 15,00 = 65,00)
--
-- Під час синку:
--   Якщо акція активна → ціна акції записується в price_retail / price_unit / price_drop
--   Звичайна ціна зберігається в price_retail_old / price_old
--   Сайт автоматично показує закреслену стару ціну
-- ============================================================

CREATE TABLE IF NOT EXISTS supplier_promotions (
  id              SERIAL        PRIMARY KEY,
  supplier_id     INT           NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  name            TEXT          NOT NULL,

  -- Ціль акції (обидва NULL = всі товари постачальника)
  our_sku         TEXT          REFERENCES products(sku) ON DELETE CASCADE,
  brand           TEXT,

  -- Тип і значення знижки
  promo_type      TEXT          NOT NULL DEFAULT 'percent'
                    CHECK (promo_type IN ('percent', 'fixed_price', 'fixed_discount')),
  value           NUMERIC(10,2) NOT NULL CHECK (value > 0),

  -- На які канали поширюється
  apply_retail    BOOLEAN       NOT NULL DEFAULT true,
  apply_wholesale BOOLEAN       NOT NULL DEFAULT false,
  apply_drop      BOOLEAN       NOT NULL DEFAULT false,

  -- Терміни дії (NULL = без обмеження)
  starts_at       TIMESTAMPTZ,
  ends_at         TIMESTAMPTZ,

  is_active       BOOLEAN       NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promotions_supplier
  ON supplier_promotions(supplier_id, is_active);

CREATE INDEX IF NOT EXISTS idx_promotions_sku
  ON supplier_promotions(our_sku) WHERE our_sku IS NOT NULL;

ALTER TABLE supplier_promotions ENABLE ROW LEVEL SECURITY;
