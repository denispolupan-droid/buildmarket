-- Правила націнок для маркетплейсів.
--
-- Було: одна націнка 10% від собівартості на всі 768 товарів (products.rozetka_markup_pct
-- / prom_markup_pct), далі накрутка комісії й округлення. Прибуток виходив рівно 10%
-- собівартості для будь-якого товару — 3 грн на диску за 9 грн і 167 грн на фарбі за 1669.
-- Витрати, які має покрити націнка, не пропорційні собівартості: комісія — так, а
-- пакування, праця й доставка фіксовані на замовлення. Тому при середньому чеку в
-- 1,2 позиції дрібний товар не окуповує навіть коробку.
--
-- Стало: цільовий прибуток = БІЛЬШЕ з двох — відсоток від собівартості або абсолютний
-- мінімум у гривнях. Абсолютний мінімум і є тим, чого бракувало.
--
-- Правило вибирається за пріоритетом (від найточнішого): товар → бренд×категорія →
-- категорія → смуга собівартості → глобальне. Кожен рівень задає лише ті поля, які
-- перекриває; решта успадковується від наступного за пріоритетом.

CREATE TABLE IF NOT EXISTS pricing_rules (
  id              BIGSERIAL   PRIMARY KEY,
  -- 'rozetka' | 'prom' | 'all' — правило може бути спільним або тільки для одного МП
  marketplace     TEXT        NOT NULL DEFAULT 'all'
                              CHECK (marketplace IN ('all', 'rozetka', 'prom')),
  -- Рівень правила; визначає пріоритет при виборі
  scope           TEXT        NOT NULL
                              CHECK (scope IN ('product', 'brand_category', 'category', 'cost_band', 'global')),
  sku             TEXT        REFERENCES products(sku) ON DELETE CASCADE,
  brand           TEXT,
  category_slug   TEXT        REFERENCES categories(slug) ON DELETE CASCADE,
  -- Смуга собівартості: [cost_from, cost_to); NULL = без межі
  cost_from       NUMERIC(12,2),
  cost_to         NUMERIC(12,2),

  markup_pct      NUMERIC(6,2),   -- % від собівартості
  min_profit_uah  NUMERIC(12,2),  -- абсолютний мінімум прибутку з одиниці
  min_price_uah   NUMERIC(12,2),  -- нижня межа ціни (напр. РРЦ постачальника)
  round_step      NUMERIC(6,2),   -- крок округлення вгору (5 = до 5 грн)
  -- Не публікувати на МП поштучно (дрібнота, яку продаємо лише мультипаком)
  exclude_single  BOOLEAN     NOT NULL DEFAULT false,

  is_active       BOOLEAN     NOT NULL DEFAULT true,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Кожен scope вимагає свій ключ і забороняє чужі
  CONSTRAINT pricing_rules_scope_keys CHECK (
    (scope = 'product'        AND sku IS NOT NULL AND category_slug IS NULL AND brand IS NULL) OR
    (scope = 'brand_category' AND sku IS NULL AND category_slug IS NOT NULL AND brand IS NOT NULL) OR
    (scope = 'category'       AND sku IS NULL AND category_slug IS NOT NULL AND brand IS NULL) OR
    (scope = 'cost_band'      AND sku IS NULL AND category_slug IS NULL AND brand IS NULL AND cost_from IS NOT NULL) OR
    (scope = 'global'         AND sku IS NULL AND category_slug IS NULL AND brand IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_pricing_rules_lookup
  ON pricing_rules(marketplace, scope) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_pricing_rules_sku
  ON pricing_rules(sku) WHERE sku IS NOT NULL AND is_active;

-- Одне активне правило на кожен ключ (щоб вибір був детермінованим)
CREATE UNIQUE INDEX IF NOT EXISTS uq_pricing_rules_product
  ON pricing_rules(marketplace, sku) WHERE scope = 'product' AND is_active;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pricing_rules_brand_cat
  ON pricing_rules(marketplace, category_slug, brand) WHERE scope = 'brand_category' AND is_active;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pricing_rules_category
  ON pricing_rules(marketplace, category_slug) WHERE scope = 'category' AND is_active;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pricing_rules_band
  ON pricing_rules(marketplace, cost_from) WHERE scope = 'cost_band' AND is_active;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pricing_rules_global
  ON pricing_rules(marketplace) WHERE scope = 'global' AND is_active;

-- ── Стартова драбина ────────────────────────────────────────────────────────
-- Розрахована на фактичних даних 2026-07-28: 22 проведені продажі Rozetka дали
-- 21 грн чистими із замовлення при середньому чеку 245 грн, тоді як пакування +
-- праця + ризик відмов ≈ 25–30 грн. Драбина піднімає це до ~55–65 грн.
-- Смуга до 50 грн — exclude_single: 96 товарів (диски від 8 грн), які фізично
-- не окуповують відправку поштучно; їх продаємо мультипаком.

INSERT INTO pricing_rules (marketplace, scope, cost_from, cost_to, markup_pct, min_profit_uah, round_step, exclude_single, note)
VALUES
  ('all', 'cost_band',    0,   50,  NULL, NULL, 5, true,  'Дрібнота: поштучно не продаємо, тільки мультипак'),
  ('all', 'cost_band',   50,  150,    28,   45, 5, false, 'Фікс з''їдає весь відсоток — тягне мінімум'),
  ('all', 'cost_band',  150,  400,    22,   60, 5, false, 'Робоча смуга, головний обсяг продажів'),
  ('all', 'cost_band',  400, 1000,    16,   90, 5, false, 'Відсоток уже достатній сам по собі'),
  ('all', 'cost_band', 1000, 2500,    13,  170, 5, false, 'Тримаємо конкурентність'),
  ('all', 'cost_band', 2500, NULL,    10,  300, 5, false, 'Абсолют і так великий')
ON CONFLICT DO NOTHING;

-- Глобальний фолбек — на випадок товару без собівартості чи поза смугами
INSERT INTO pricing_rules (marketplace, scope, markup_pct, min_profit_uah, round_step, note)
VALUES ('all', 'global', 20, 45, 5, 'Фолбек, якщо жодна смуга не підійшла')
ON CONFLICT DO NOTHING;
