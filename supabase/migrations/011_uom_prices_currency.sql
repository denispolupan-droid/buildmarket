-- ============================================================
-- Единицы измерения, прайс-листы, валюты, резервы, сторно
-- ============================================================
--
-- БЛОКИ:
--   1. UOM         — единицы измерения и коэффициенты пересчёта
--   2. Прайс-листы — структурированные цены, клиентские правила, МДЦ
--   3. Валюты      — справочник + история курсов + поля на документах
--   4. Резервы     — срок жизни и статус
--   5. Сторно      — поле reversal_of на документах
-- ============================================================


-- ============================================================
-- БЛОК 1. ЕДИНИЦЫ ИЗМЕРЕНИЯ
-- ============================================================
--
-- Трёхуровневая модель:
--   base_uom      — базовая единица хранения (всегда одна, неизменна)
--   sale_uom      — единица продажи клиенту (NULL = base_uom)
--   purchase_uom  — единица закупки у поставщика (NULL = base_uom)
--
-- purchase_uom_factor — сколько base_uom в одной purchase_uom
--   Пример: герметик 600мл
--     base = 'pcs', sale = 'pcs', purchase = 'box'
--     purchase_uom_factor = 12 → 1 коробка = 12 штук
--
-- В строках документа:
--   uom_code   — в каких единицах оформлен документ
--   uom_factor — скопировано с товара на момент создания строки
--   qty_in_base = qty × uom_factor (вычисляемое, для stock_movements)
--
-- stock_movements всегда в base_uom.
-- ============================================================

CREATE TABLE IF NOT EXISTS uom (
  code        TEXT     PRIMARY KEY,
  name        TEXT     NOT NULL,       -- 'штука', 'відро', 'мішок', 'паллет'
  name_short  TEXT     NOT NULL,       -- 'шт.', 'від.', 'міш.', 'пал.'
  type        TEXT     NOT NULL        -- piece | weight | volume | area | length | package
                CHECK (type IN ('piece','weight','volume','area','length','package')),
  is_active   BOOLEAN  NOT NULL DEFAULT true,
  sort_order  INT      DEFAULT 0
);

INSERT INTO uom (code, name, name_short, type, sort_order) VALUES
  ('pcs',    'штука',        'шт.',   'piece',   10),
  ('pack',   'упаковка',     'уп.',   'package', 20),
  ('box',    'коробка',      'кор.',  'package', 30),
  ('bucket', 'відро',        'від.',  'piece',   40),
  ('bag',    'мішок',        'міш.',  'package', 50),
  ('pallet', 'паллет',       'пал.',  'package', 60),
  ('kg',     'кілограм',     'кг',    'weight',  70),
  ('g',      'грам',         'г',     'weight',  80),
  ('liter',  'літр',         'л',     'volume',  90),
  ('ml',     'мілілітр',     'мл',    'volume',  100),
  ('m2',     'квадратний метр', 'м²', 'area',    110),
  ('m',      'метр погонний','м.п.', 'length',   120),
  ('roll',   'рулон',        'рул.',  'piece',   130)
ON CONFLICT (code) DO NOTHING;


-- Поля UOM на товарах
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS base_uom             TEXT REFERENCES uom(code) DEFAULT 'pcs',
  ADD COLUMN IF NOT EXISTS sale_uom             TEXT REFERENCES uom(code),  -- NULL = base_uom
  ADD COLUMN IF NOT EXISTS purchase_uom         TEXT REFERENCES uom(code),  -- NULL = base_uom
  ADD COLUMN IF NOT EXISTS purchase_uom_factor  NUMERIC(14,6) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS min_price            NUMERIC(12,2);  -- МДЦ: нельзя продавать ниже


-- Поля UOM в строках документов
-- qty_in_base — сколько базовых единиц; идёт в stock_movements
-- qty_actual / qty_system — для документов типа 'inventory'

-- Сначала снимаем ограничение qty > 0 (инвентаризация может давать отрицательную коррекцию)
ALTER TABLE acc_document_lines
  DROP CONSTRAINT IF EXISTS acc_document_lines_qty_check;
ALTER TABLE acc_document_lines DROP CONSTRAINT IF EXISTS acc_document_lines_qty_nonzero;
ALTER TABLE acc_document_lines
  ADD CONSTRAINT acc_document_lines_qty_nonzero CHECK (qty <> 0);

ALTER TABLE acc_document_lines
  ADD COLUMN IF NOT EXISTS uom_code     TEXT REFERENCES uom(code),
  ADD COLUMN IF NOT EXISTS uom_factor   NUMERIC(14,6) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS qty_in_base  NUMERIC(14,6)
                              GENERATED ALWAYS AS (qty * uom_factor) STORED,
  ADD COLUMN IF NOT EXISTS qty_actual   NUMERIC(12,3),  -- инвентаризация: по факту
  ADD COLUMN IF NOT EXISTS qty_system   NUMERIC(12,3);  -- инвентаризация: по системе


-- ============================================================
-- БЛОК 2. ПРАЙС-ЛИСТЫ И ТИПЫ ЦЕН
-- ============================================================
--
-- Иерархия применения цены (от высшего к низшему приоритету):
--   1. customer_price_rules (customer + sku)   — персональная цена
--   2. customer_price_rules (customer + category) — на категорию
--   3. price_lists привязанный к клиенту       — прайс клиента
--   4. product_stock.price_unit / price_drop   — базовый прайс
--
-- Ступенчатые цены (volume pricing):
--   product_prices UNIQUE (price_list_id, sku, min_qty)
--   Пример: qty 1-9 = 120 грн, qty 10+ = 105 грн
-- ============================================================

CREATE TABLE IF NOT EXISTS price_lists (
  id           SERIAL       PRIMARY KEY,
  code         TEXT         UNIQUE NOT NULL,
  name         TEXT         NOT NULL,
  type         TEXT         NOT NULL
                 CHECK (type IN ('retail','wholesale','drop','marketplace','custom')),
  currency     TEXT         NOT NULL DEFAULT 'UAH',
  is_default   BOOLEAN      NOT NULL DEFAULT false,
  is_active    BOOLEAN      NOT NULL DEFAULT true,
  valid_from   TIMESTAMPTZ,
  valid_until  TIMESTAMPTZ,
  notes        TEXT,
  created_at   TIMESTAMPTZ  DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS price_lists_one_default
  ON price_lists(type) WHERE is_default = true;

INSERT INTO price_lists (code, name, type, is_default) VALUES
  ('retail',   'Роздріб',   'retail',      true),
  ('wholesale','Опт',       'wholesale',   true),
  ('drop',     'Дроп',      'drop',        true),
  ('prom',     'Prom.ua',   'marketplace', false),
  ('rozetka',  'Rozetka',   'marketplace', false)
ON CONFLICT (code) DO NOTHING;

-- ---

CREATE TABLE IF NOT EXISTS product_prices (
  id             SERIAL         PRIMARY KEY,
  price_list_id  INT            NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
  sku            TEXT           NOT NULL REFERENCES products(sku)   ON DELETE CASCADE,
  min_qty        NUMERIC(12,3)  NOT NULL DEFAULT 1,   -- от какого кол-ва действует цена
  price          NUMERIC(12,2)  NOT NULL CHECK (price >= 0),
  updated_at     TIMESTAMPTZ    DEFAULT NOW(),
  UNIQUE (price_list_id, sku, min_qty)
);

CREATE INDEX IF NOT EXISTS idx_product_prices_sku
  ON product_prices(sku, price_list_id);

DROP TRIGGER IF EXISTS trg_product_prices_updated_at ON product_prices;
CREATE TRIGGER trg_product_prices_updated_at
  BEFORE UPDATE ON product_prices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---
-- Персональные цены / правила для конкретного клиента
-- Применяются поверх любого прайс-листа.
-- Варианты: price_list_id (переключить на другой прайс)
--           price_override (фиксированная цена)
--           discount_pct (скидка % с базы)

CREATE TABLE IF NOT EXISTS customer_price_rules (
  id              SERIAL         PRIMARY KEY,
  customer_id     UUID           NOT NULL REFERENCES customers(id) ON DELETE CASCADE,

  -- Область применения (NULL = ко всем в этой категории)
  sku             TEXT           REFERENCES products(sku),
  category_slug   TEXT           REFERENCES categories(slug),

  -- Правило (заполнить одно из трёх)
  price_list_id   INT            REFERENCES price_lists(id),
  price_override  NUMERIC(12,2)  CHECK (price_override >= 0),
  discount_pct    NUMERIC(5,2)   CHECK (discount_pct BETWEEN 0 AND 100),

  valid_from      TIMESTAMPTZ,
  valid_until     TIMESTAMPTZ,
  is_active       BOOLEAN        NOT NULL DEFAULT true,
  notes           TEXT,
  created_at      TIMESTAMPTZ    DEFAULT NOW(),

  CONSTRAINT one_rule_type CHECK (
    (price_list_id IS NOT NULL)::INT +
    (price_override IS NOT NULL)::INT +
    (discount_pct IS NOT NULL)::INT = 1
  )
);

CREATE INDEX IF NOT EXISTS idx_cust_price_rules_customer
  ON customer_price_rules(customer_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_cust_price_rules_sku
  ON customer_price_rules(sku) WHERE sku IS NOT NULL AND is_active = true;

-- ---
-- Привязать клиента и аккаунт маркетплейса к прайс-листу по умолчанию

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS price_list_id INT REFERENCES price_lists(id);

ALTER TABLE marketplace_accounts
  ADD COLUMN IF NOT EXISTS price_list_id INT REFERENCES price_lists(id);


-- ============================================================
-- БЛОК 3. ВАЛЮТЫ И КУРСЫ
-- ============================================================
--
-- Базовая валюта учёта: UAH.
-- exchange_rate = сколько UAH за 1 единицу иностранной валюты.
--
-- На документе:
--   currency / exchange_rate — валюта и курс на дату документа
--
-- На строке документа:
--   exchange_rate — копия с заголовка (для вычисляемого поля price_uah)
--   price_uah = price × exchange_rate
-- ============================================================

CREATE TABLE IF NOT EXISTS currencies (
  code      TEXT     PRIMARY KEY,   -- 'UAH' | 'USD' | 'EUR' | 'PLN'
  name      TEXT     NOT NULL,
  symbol    TEXT     NOT NULL,
  is_base   BOOLEAN  NOT NULL DEFAULT false,
  is_active BOOLEAN  NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX IF NOT EXISTS currencies_one_base
  ON currencies(is_base) WHERE is_base = true;

INSERT INTO currencies (code, name, symbol, is_base) VALUES
  ('UAH', 'Гривня',    '₴', true),
  ('USD', 'Долар США', '$', false),
  ('EUR', 'Євро',      '€', false),
  ('PLN', 'Злотий',    'zł',false)
ON CONFLICT (code) DO NOTHING;

-- ---

CREATE TABLE IF NOT EXISTS exchange_rates (
  id         SERIAL          PRIMARY KEY,
  currency   TEXT            NOT NULL REFERENCES currencies(code),
  rate       NUMERIC(14,6)   NOT NULL CHECK (rate > 0),
  rate_date  DATE            NOT NULL,
  source     TEXT            NOT NULL DEFAULT 'manual'
               CHECK (source IN ('nbu','privatbank','manual')),
  UNIQUE (currency, rate_date)
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_lookup
  ON exchange_rates(currency, rate_date DESC);

-- ---
-- Валюта и курс на документах

ALTER TABLE acc_documents
  ADD COLUMN IF NOT EXISTS currency      TEXT            REFERENCES currencies(code) DEFAULT 'UAH',
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(14,6)   NOT NULL DEFAULT 1;

-- Валюта и курс на строках документа (копируется с заголовка при создании)
-- price_uah = цена строки, приведённая к гривне

ALTER TABLE acc_document_lines
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(14,6)   NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS price_uah     NUMERIC(12,2)
                              GENERATED ALWAYS AS (price * exchange_rate) STORED;

-- amount_uah = полная сумма строки в гривне
-- Вычисляется как qty_in_base × price × exchange_rate — доступно через JOIN или VIEW.
-- Хранить отдельным GENERATED ALWAYS нельзя (нужен qty_in_base и exchange_rate).
-- Рекомендуется VIEW или вычислять в приложении.


-- ============================================================
-- БЛОК 4. СРОК ЖИЗНИ РЕЗЕРВОВ
-- ============================================================
--
-- expires_at     — когда резерв истекает автоматически
-- status         — active | expired | released
--
-- expire_stock_reservations() — функция для вызова по cron-расписанию.
-- Обновляет статус просроченных резервов и освобождает qty_reserved в balance.
-- ============================================================

ALTER TABLE stock_reservations
  ADD COLUMN IF NOT EXISTS expires_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reservation_status  TEXT NOT NULL DEFAULT 'active'
                             CHECK (reservation_status IN ('active','expired','released'));

-- Индекс для cron-задачи: найти все просроченные активные резервы
CREATE INDEX IF NOT EXISTS idx_reservations_expires
  ON stock_reservations(expires_at)
  WHERE reservation_status = 'active' AND expires_at IS NOT NULL;

-- Функция: истекает резервы; вызывать по расписанию (например, каждые 15 минут)
CREATE OR REPLACE FUNCTION expire_stock_reservations()
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  v_count INT;
BEGIN
  WITH expired AS (
    UPDATE stock_reservations
    SET released_at         = NOW(),
        reservation_status  = 'expired',
        release_reason      = 'expired'
    WHERE reservation_status = 'active'
      AND expires_at IS NOT NULL
      AND expires_at < NOW()
    RETURNING warehouse_id, sku, qty
  )
  -- Вернуть qty_reserved в balance (триггер trg_stock_reserved_update сделает это,
  -- но он срабатывает только при UPDATE released_at NULL→NOT NULL — что и происходит выше)
  SELECT COUNT(*) INTO v_count FROM expired;

  RETURN v_count;
END;
$$;


-- ============================================================
-- БЛОК 5. СТОРНИРОВАНИЕ ДОКУМЕНТОВ
-- ============================================================
--
-- reversal_of — ссылка сторно-документа на оригинальный документ.
-- Правило: проведённый документ нельзя удалить.
-- Для отмены создаётся новый документ с reversal_of = id оригинала.
-- Строки сторно-документа = строки оригинала с обратными qty.
--
-- Пример:
--   Оригинал РН-2025-0041 (продажа, confirmed)
--   Сторно   РН-2025-0042 (reversal_of = РН-2025-0041, cancelled оригинал помечается)
-- ============================================================

ALTER TABLE acc_documents
  ADD COLUMN IF NOT EXISTS reversal_of UUID REFERENCES acc_documents(id);

CREATE INDEX IF NOT EXISTS idx_acc_doc_reversal
  ON acc_documents(reversal_of) WHERE reversal_of IS NOT NULL;

-- Защита: нельзя создать второе сторно на один и тот же документ
CREATE UNIQUE INDEX IF NOT EXISTS idx_acc_doc_one_reversal
  ON acc_documents(reversal_of) WHERE reversal_of IS NOT NULL;


-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE uom                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_lists           ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_prices        ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_price_rules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE currencies            ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_rates        ENABLE ROW LEVEL SECURITY;
