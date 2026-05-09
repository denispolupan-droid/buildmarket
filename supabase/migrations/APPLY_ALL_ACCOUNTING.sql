-- ============================================================
-- УЧЁТНАЯ СИСТЕМА — ВСЕ МИГРАЦИИ (008–011)
-- Вставить целиком в Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- ╔══════════════════════════════════════════════════════════╗
-- ║  008_accounting_core.sql                               ║
-- ╚══════════════════════════════════════════════════════════╝

-- ============================================================
-- Ядро управленческого учёта
-- ============================================================
--
-- ПРИНЦИПЫ:
--   1. Остаток меняется только через подтверждённые документы
--   2. stock_movements — append-only, защищён триггером от DELETE/UPDATE
--   3. stock_balance — материализованный остаток, обновляется триггером
--   4. Резервы (stock_reservations) отделены от физических движений
--   5. Себестоимость — средневзвешенная (avg_cost)
--   6. Дропшипинг — первоклассная сущность; дроп-продажа не создаёт
--      физического движения, но фиксирует выручку и себестоимость
--   7. Растущие перечни (doc_type, category, payment_method) хранятся
--      в справочных таблицах — без CHECK на основных таблицах
--   8. meta JSONB на ключевых таблицах — расширение без миграций
--
-- ТИПЫ СКЛАДОВ:
--   physical  — наш физический склад
--   supplier  — виртуальный склад поставщика (информационный, для дропа)
--   transit   — товар в пути от поставщика (ожидаемые поступления)
--
-- ЖИЗНЕННЫЙ ЦИКЛ ДОКУМЕНТА:
--   draft → confirmed → (cancelled)
--   Только confirmed создаёт stock_movements.
--   Отмена confirmed документа создаёт сторно-движения.
--
-- ТИПЫ ДОКУМЕНТОВ:
--   purchase_order — заказ поставщику (товар ещё в пути)
--   receipt        — приход товара на склад (закрывает purchase_order)
--   sale           — продажа (расход со склада или дропшип)
--   return_in      — возврат от покупателя (приход на склад)
--   return_out     — возврат поставщику (расход со склада)
--   write_off      — списание (брак, порча)
--   transfer       — перемещение между складами
--   inventory      — инвентаризация (коррекция остатков)
-- ============================================================


-- ── 1. Справочники (расширяемые перечни) ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS acc_doc_types (
  code        TEXT  PRIMARY KEY,
  name        TEXT  NOT NULL,
  direction   TEXT  NOT NULL CHECK (direction IN ('in','out','both','none')),
  sort_order  INT   DEFAULT 0
);

INSERT INTO acc_doc_types (code, name, direction, sort_order) VALUES
  ('purchase_order', 'Замовлення постачальнику', 'none', 10),
  ('receipt',        'Приход товару',            'in',   20),
  ('sale',           'Продаж',                   'out',  30),
  ('return_in',      'Повернення від покупця',   'in',   40),
  ('return_out',     'Повернення постачальнику',  'out',  50),
  ('write_off',      'Списання',                 'out',  60),
  ('transfer',       'Переміщення',              'both', 70),
  ('inventory',      'Інвентаризація',           'both', 80)
ON CONFLICT (code) DO NOTHING;

-- ---

CREATE TABLE IF NOT EXISTS acc_expense_categories (
  code        TEXT  PRIMARY KEY,
  name        TEXT  NOT NULL,
  sort_order  INT   DEFAULT 0
);

INSERT INTO acc_expense_categories (code, name, sort_order) VALUES
  ('shipping',   'Доставка',       10),
  ('salary',     'Зарплата',       20),
  ('rent',       'Оренда',         30),
  ('marketing',  'Маркетинг',      40),
  ('tax',        'Податки',        50),
  ('bank_fee',   'Банківські комісії', 60),
  ('packaging',  'Пакування',      70),
  ('other',      'Інше',           99)
ON CONFLICT (code) DO NOTHING;

-- ---

CREATE TABLE IF NOT EXISTS acc_payment_methods (
  code        TEXT  PRIMARY KEY,
  name        TEXT  NOT NULL,
  sort_order  INT   DEFAULT 0
);

INSERT INTO acc_payment_methods (code, name, sort_order) VALUES
  ('cash',       'Готівка',          10),
  ('card',       'Карта',            20),
  ('bank',       'Банківський переказ', 30),
  ('online',     'Онлайн-оплата',    40),
  ('cod',        'Накладений платіж', 50),
  ('crypto',     'Крипто',           60)
ON CONFLICT (code) DO NOTHING;


-- ── 2. Склади ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS warehouses (
  id              SERIAL       PRIMARY KEY,
  slug            TEXT         UNIQUE NOT NULL,
  name            TEXT         NOT NULL,
  warehouse_type  TEXT         NOT NULL DEFAULT 'physical'
                    CHECK (warehouse_type IN ('physical','supplier','transit')),
  supplier_id     INT          REFERENCES suppliers(id) ON DELETE SET NULL,
  address         TEXT,
  is_default      BOOLEAN      NOT NULL DEFAULT false,
  is_active       BOOLEAN      NOT NULL DEFAULT true,
  sort_order      INT          DEFAULT 0,
  created_at      TIMESTAMPTZ  DEFAULT NOW()
);

-- Только один физический склад может быть дефолтным
CREATE UNIQUE INDEX IF NOT EXISTS warehouses_one_default
  ON warehouses (is_default) WHERE is_default = true;

-- Основной склад
INSERT INTO warehouses (slug, name, warehouse_type, is_default) VALUES
  ('main', 'Основний склад', 'physical', true)
ON CONFLICT (slug) DO NOTHING;

-- Создать виртуальный склад для каждого существующего поставщика
INSERT INTO warehouses (slug, name, warehouse_type, supplier_id, is_active, sort_order)
SELECT
  'supplier-' || s.slug,
  s.name || ' (дроп)',
  'supplier',
  s.id,
  s.is_active,
  100
FROM suppliers s
ON CONFLICT (slug) DO NOTHING;

-- Триггер: автоматически создаёт виртуальный склад при добавлении поставщика
CREATE OR REPLACE FUNCTION fn_create_supplier_warehouse()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO warehouses (slug, name, warehouse_type, supplier_id, is_active, sort_order)
  VALUES (
    'supplier-' || NEW.slug,
    NEW.name || ' (дроп)',
    'supplier',
    NEW.id,
    NEW.is_active,
    100
  )
  ON CONFLICT (slug) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_supplier_warehouse ON suppliers;
CREATE TRIGGER trg_create_supplier_warehouse
  AFTER INSERT ON suppliers
  FOR EACH ROW EXECUTE FUNCTION fn_create_supplier_warehouse();


-- ── 3. Заголовок документа ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS acc_documents (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Тип и статус
  doc_type         TEXT          NOT NULL REFERENCES acc_doc_types(code),
  doc_number       TEXT          NOT NULL,
  status           TEXT          NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','confirmed','cancelled')),

  -- Склады
  warehouse_id     INT           NOT NULL REFERENCES warehouses(id),
  warehouse_to_id  INT           REFERENCES warehouses(id),  -- только для transfer

  -- Контрагенты
  supplier_id      INT           REFERENCES suppliers(id),
  order_id         UUID,           -- → orders.id (sale, return_in)
  counterparty     TEXT,           -- свободное поле: имя клиента / описание

  -- Суммы
  total_amount     NUMERIC(14,2)  NOT NULL DEFAULT 0,  -- сумма по ценам документа
  total_cost       NUMERIC(14,2)  NOT NULL DEFAULT 0,  -- сумма по себестоимости

  -- Доставка и логистика
  tracking_number  TEXT,           -- ТТН Новой Почты или другого перевозчика
  expected_date    TIMESTAMPTZ,    -- ожидаемая дата поступления (для purchase_order)

  doc_date         TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  notes            TEXT,

  -- Аудит
  confirmed_at     TIMESTAMPTZ,
  confirmed_by     TEXT,
  cancelled_at     TIMESTAMPTZ,
  cancelled_by     TEXT,
  cancel_reason    TEXT,
  created_at       TIMESTAMPTZ    DEFAULT NOW(),
  created_by       TEXT,

  -- Расширение без миграций
  meta             JSONB          NOT NULL DEFAULT '{}',

  CONSTRAINT transfer_needs_destination
    CHECK (doc_type <> 'transfer' OR warehouse_to_id IS NOT NULL),
  CONSTRAINT transfer_warehouses_differ
    CHECK (warehouse_to_id IS NULL OR warehouse_id <> warehouse_to_id)
);

CREATE INDEX IF NOT EXISTS idx_acc_doc_type     ON acc_documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_acc_doc_status   ON acc_documents(status);
CREATE INDEX IF NOT EXISTS idx_acc_doc_date     ON acc_documents(doc_date DESC);
CREATE INDEX IF NOT EXISTS idx_acc_doc_order    ON acc_documents(order_id);
CREATE INDEX IF NOT EXISTS idx_acc_doc_supplier ON acc_documents(supplier_id);
CREATE INDEX IF NOT EXISTS idx_acc_doc_tracking ON acc_documents(tracking_number)
  WHERE tracking_number IS NOT NULL;


-- ── 4. Строки документа ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS acc_document_lines (
  id               SERIAL          PRIMARY KEY,
  document_id      UUID            NOT NULL REFERENCES acc_documents(id) ON DELETE CASCADE,
  sku              TEXT            NOT NULL REFERENCES products(sku),
  qty              NUMERIC(12,3)   NOT NULL CHECK (qty > 0),
  price            NUMERIC(12,2)   NOT NULL CHECK (price >= 0),
  cost_price       NUMERIC(12,2)   CHECK (cost_price >= 0),
  amount           NUMERIC(14,2)   GENERATED ALWAYS AS (qty * price) STORED,

  -- Источник отгрузки для этой строки (может отличаться от склада документа)
  -- NULL = берётся из acc_documents.warehouse_id
  warehouse_id     INT             REFERENCES warehouses(id),

  -- Дропшипинг на уровне строки (mixed-заказы: часть своё, часть дроп)
  fulfillment_type TEXT            NOT NULL DEFAULT 'own'
                     CHECK (fulfillment_type IN ('own','dropship')),
  supplier_id      INT             REFERENCES suppliers(id),  -- кто отгружает при дропе

  sort_order       INT             DEFAULT 0,
  meta             JSONB           NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_doc_lines_document ON acc_document_lines(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_lines_sku      ON acc_document_lines(sku);


-- ── 5. Журнал движений товаров ────────────────────────────────────────────────
--
-- APPEND-ONLY. Защищён триггером — DELETE и UPDATE запрещены.
-- Создаётся автоматически при подтверждении документа.
-- qty > 0 = приход, qty < 0 = расход.
-- Дропшипные продажи НЕ создают записей здесь (нет физического движения).

CREATE TABLE IF NOT EXISTS stock_movements (
  id               BIGSERIAL       PRIMARY KEY,
  document_id      UUID            NOT NULL REFERENCES acc_documents(id),
  document_line_id INT             REFERENCES acc_document_lines(id),
  doc_type         TEXT            NOT NULL,
  warehouse_id     INT             NOT NULL REFERENCES warehouses(id),
  sku              TEXT            NOT NULL REFERENCES products(sku),
  qty              NUMERIC(12,3)   NOT NULL CHECK (qty <> 0),
  cost_price       NUMERIC(12,4),
  sale_price       NUMERIC(12,2),
  moved_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  order_id         UUID,
  supplier_id      INT             REFERENCES suppliers(id),
  meta             JSONB           NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_movements_sku       ON stock_movements(sku);
CREATE INDEX IF NOT EXISTS idx_movements_warehouse ON stock_movements(warehouse_id, sku);
CREATE INDEX IF NOT EXISTS idx_movements_date      ON stock_movements(moved_at DESC);
CREATE INDEX IF NOT EXISTS idx_movements_document  ON stock_movements(document_id);
CREATE INDEX IF NOT EXISTS idx_movements_order     ON stock_movements(order_id);

-- Защита от изменения: stock_movements иммутабелен
CREATE OR REPLACE FUNCTION fn_guard_stock_movements()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'stock_movements is append-only. Use a reversal document instead.';
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_movements_update ON stock_movements;
CREATE TRIGGER trg_guard_movements_update
  BEFORE UPDATE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION fn_guard_stock_movements();

DROP TRIGGER IF EXISTS trg_guard_movements_delete ON stock_movements;
CREATE TRIGGER trg_guard_movements_delete
  BEFORE DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION fn_guard_stock_movements();


-- ── 6. Остатки (материализованный баланс) ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS stock_balance (
  warehouse_id    INT             NOT NULL REFERENCES warehouses(id),
  sku             TEXT            NOT NULL REFERENCES products(sku),
  qty_total       NUMERIC(12,3)   NOT NULL DEFAULT 0,
  qty_reserved    NUMERIC(12,3)   NOT NULL DEFAULT 0,
  qty_available   NUMERIC(12,3)   GENERATED ALWAYS AS (qty_total - qty_reserved) STORED,
  avg_cost        NUMERIC(12,4)   NOT NULL DEFAULT 0,
  min_reorder_qty NUMERIC(12,3),   -- сигнал: дозаказать если qty_total <= этого
  updated_at      TIMESTAMPTZ     DEFAULT NOW(),
  PRIMARY KEY (warehouse_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_balance_sku ON stock_balance(sku);
-- Индекс для поиска товаров ниже минимума
CREATE INDEX IF NOT EXISTS idx_balance_reorder
  ON stock_balance(warehouse_id)
  WHERE min_reorder_qty IS NOT NULL;


-- ── 7. Резервы ────────────────────────────────────────────────────────────────
--
-- released_at IS NULL = активный резерв.
-- release_reason: shipped | cancelled | manual

CREATE TABLE IF NOT EXISTS stock_reservations (
  id              BIGSERIAL       PRIMARY KEY,
  order_id        UUID            NOT NULL,
  sku             TEXT            NOT NULL REFERENCES products(sku),
  warehouse_id    INT             NOT NULL REFERENCES warehouses(id),
  qty             NUMERIC(12,3)   NOT NULL CHECK (qty > 0),
  reserved_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  released_at     TIMESTAMPTZ,
  release_reason  TEXT
);

CREATE INDEX IF NOT EXISTS idx_reservations_order ON stock_reservations(order_id);
CREATE INDEX IF NOT EXISTS idx_reservations_active
  ON stock_reservations(sku, warehouse_id)
  WHERE released_at IS NULL;


-- ── 8. История цен ────────────────────────────────────────────────────────────
--
-- price_type: cost | retail | wholesale | drop | (расширяемо)

CREATE TABLE IF NOT EXISTS price_history (
  id          BIGSERIAL       PRIMARY KEY,
  sku         TEXT            NOT NULL REFERENCES products(sku),
  price_type  TEXT            NOT NULL,
  price_old   NUMERIC(12,2),
  price_new   NUMERIC(12,2)   NOT NULL,
  changed_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  changed_by  TEXT,
  source      TEXT            -- sync | manual | import | receipt
);

CREATE INDEX IF NOT EXISTS idx_price_history_sku
  ON price_history(sku, price_type, changed_at DESC);


-- ── 9. Оплаты ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS acc_payments (
  id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_type    TEXT            NOT NULL CHECK (payment_type IN ('incoming','outgoing')),
  payment_method  TEXT            NOT NULL REFERENCES acc_payment_methods(code),
  counterparty    TEXT,
  order_id        UUID,
  supplier_id     INT             REFERENCES suppliers(id),
  document_id     UUID            REFERENCES acc_documents(id),
  amount          NUMERIC(14,2)   NOT NULL CHECK (amount > 0),
  currency        TEXT            NOT NULL DEFAULT 'UAH',
  exchange_rate   NUMERIC(10,4)   NOT NULL DEFAULT 1,  -- курс к UAH
  amount_uah      NUMERIC(14,2)   GENERATED ALWAYS AS (amount * exchange_rate) STORED,
  payment_date    TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  description     TEXT,
  status          TEXT            NOT NULL DEFAULT 'confirmed'
                    CHECK (status IN ('pending','confirmed','cancelled')),
  created_at      TIMESTAMPTZ     DEFAULT NOW(),
  created_by      TEXT,
  meta            JSONB           NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_payments_order    ON acc_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_supplier ON acc_payments(supplier_id);
CREATE INDEX IF NOT EXISTS idx_payments_date     ON acc_payments(payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_type     ON acc_payments(payment_type, status);


-- ── 10. Расходы (не товарные) ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS acc_expenses (
  id            UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  category      TEXT            NOT NULL REFERENCES acc_expense_categories(code),
  sub_category  TEXT,
  amount        NUMERIC(14,2)   NOT NULL CHECK (amount > 0),
  description   TEXT,
  expense_date  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  payment_id    UUID            REFERENCES acc_payments(id),
  created_at    TIMESTAMPTZ     DEFAULT NOW(),
  created_by    TEXT,
  meta          JSONB           NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_expenses_date     ON acc_expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON acc_expenses(category);


-- ── 11. Нумерация документов ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS acc_doc_sequences (
  doc_type    TEXT  PRIMARY KEY REFERENCES acc_doc_types(code),
  prefix      TEXT  NOT NULL,
  year        INT   NOT NULL,
  last_number INT   NOT NULL DEFAULT 0
);

INSERT INTO acc_doc_sequences (doc_type, prefix, year) VALUES
  ('purchase_order', 'ЗП', EXTRACT(YEAR FROM NOW())::INT),
  ('receipt',        'ПН', EXTRACT(YEAR FROM NOW())::INT),
  ('sale',           'РН', EXTRACT(YEAR FROM NOW())::INT),
  ('return_in',      'ПВ', EXTRACT(YEAR FROM NOW())::INT),
  ('return_out',     'ВП', EXTRACT(YEAR FROM NOW())::INT),
  ('write_off',      'СП', EXTRACT(YEAR FROM NOW())::INT),
  ('transfer',       'ПМ', EXTRACT(YEAR FROM NOW())::INT),
  ('inventory',      'ІН', EXTRACT(YEAR FROM NOW())::INT)
ON CONFLICT (doc_type) DO NOTHING;

CREATE OR REPLACE FUNCTION next_doc_number(p_type TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_year   INT;
  v_num    INT;
  v_prefix TEXT;
BEGIN
  v_year := EXTRACT(YEAR FROM NOW())::INT;

  UPDATE acc_doc_sequences
  SET last_number = 0, year = v_year
  WHERE doc_type = p_type AND year < v_year;

  UPDATE acc_doc_sequences
  SET last_number = last_number + 1
  WHERE doc_type = p_type
  RETURNING last_number, prefix INTO v_num, v_prefix;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown doc_type: %', p_type;
  END IF;

  RETURN v_prefix || '-' || v_year || '-' || LPAD(v_num::TEXT, 4, '0');
END;
$$;


-- ── 12. Триггер: stock_balance ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_update_stock_balance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO stock_balance (warehouse_id, sku, qty_total, avg_cost)
  VALUES (
    NEW.warehouse_id,
    NEW.sku,
    NEW.qty,
    CASE WHEN NEW.qty > 0 AND NEW.cost_price IS NOT NULL
         THEN NEW.cost_price ELSE 0 END
  )
  ON CONFLICT (warehouse_id, sku) DO UPDATE SET
    qty_total = stock_balance.qty_total + NEW.qty,
    avg_cost  = CASE
      WHEN NEW.qty > 0
       AND NEW.cost_price IS NOT NULL
       AND (stock_balance.qty_total + NEW.qty) > 0
      THEN (stock_balance.qty_total * stock_balance.avg_cost
            + NEW.qty * NEW.cost_price)
           / (stock_balance.qty_total + NEW.qty)
      ELSE stock_balance.avg_cost
    END,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_balance_update ON stock_movements;
CREATE TRIGGER trg_stock_balance_update
  AFTER INSERT ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION fn_update_stock_balance();


-- ── 13. Триггер: qty_reserved в stock_balance ──────────────────────────────────

CREATE OR REPLACE FUNCTION fn_update_stock_reserved()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO stock_balance (warehouse_id, sku, qty_reserved)
    VALUES (NEW.warehouse_id, NEW.sku, NEW.qty)
    ON CONFLICT (warehouse_id, sku) DO UPDATE SET
      qty_reserved = stock_balance.qty_reserved + NEW.qty,
      updated_at   = NOW();

  ELSIF TG_OP = 'UPDATE'
    AND OLD.released_at IS NULL
    AND NEW.released_at IS NOT NULL
  THEN
    UPDATE stock_balance
    SET qty_reserved = GREATEST(0, qty_reserved - OLD.qty),
        updated_at   = NOW()
    WHERE warehouse_id = OLD.warehouse_id AND sku = OLD.sku;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_reserved_update ON stock_reservations;
CREATE TRIGGER trg_stock_reserved_update
  AFTER INSERT OR UPDATE ON stock_reservations
  FOR EACH ROW EXECUTE FUNCTION fn_update_stock_reserved();


-- ── 14. Триггер: история цен ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_track_price_history()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.price_cost IS DISTINCT FROM NEW.price_cost AND NEW.price_cost IS NOT NULL THEN
    INSERT INTO price_history (sku, price_type, price_old, price_new, source)
    VALUES (NEW.sku, 'cost', OLD.price_cost, NEW.price_cost, 'sync');
  END IF;
  IF OLD.price_unit IS DISTINCT FROM NEW.price_unit THEN
    INSERT INTO price_history (sku, price_type, price_old, price_new, source)
    VALUES (NEW.sku, 'retail', OLD.price_unit, NEW.price_unit, 'sync');
  END IF;
  IF OLD.price_drop IS DISTINCT FROM NEW.price_drop AND NEW.price_drop IS NOT NULL THEN
    INSERT INTO price_history (sku, price_type, price_old, price_new, source)
    VALUES (NEW.sku, 'drop', OLD.price_drop, NEW.price_drop, 'sync');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_price_history ON product_stock;
CREATE TRIGGER trg_price_history
  AFTER UPDATE ON product_stock
  FOR EACH ROW EXECUTE FUNCTION fn_track_price_history();


-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE acc_doc_types          ENABLE ROW LEVEL SECURITY;
ALTER TABLE acc_expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE acc_payment_methods    ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses             ENABLE ROW LEVEL SECURITY;
ALTER TABLE acc_documents          ENABLE ROW LEVEL SECURITY;
ALTER TABLE acc_document_lines     ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements        ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_balance          ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_reservations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history          ENABLE ROW LEVEL SECURITY;
ALTER TABLE acc_payments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE acc_expenses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE acc_doc_sequences      ENABLE ROW LEVEL SECURITY;


-- ╔══════════════════════════════════════════════════════════╗
-- ║  009_channels_marketplaces.sql                         ║
-- ╚══════════════════════════════════════════════════════════╝

-- ============================================================
-- Каналы продаж, маркетплейсы, POS, правила маршрутизации
-- ============================================================
--
-- АРХИТЕКТУРА МАРКЕТПЛЕЙСОВ:
--
--   Входящий поток (маркетплейс → нас):
--     Webhook/polling → marketplace_orders (raw) → orders (наш)
--
--   Исходящий поток (мы → маркетплейс):
--     stock_balance изменился  → трг → marketplace_sync_queue (stock)
--     price_history изменилась → трг → marketplace_sync_queue (price)
--     Worker читает queue → вызывает API → обновляет listing
--
--   Идемпотентность:
--     UNIQUE (marketplace_id, external_order_id) — дубль заказа игнорируется
--     Partial UNIQUE на queue — один pending на листинг/тип
--
--   Аудит:
--     raw_payload JSONB — полный ответ API сохраняется всегда
--     marketplace_sync_log — история каждой операции синхронизации
-- ============================================================


-- ── 1. Каналы продаж ──────────────────────────────────────────────────────────
--
-- Единственный источник истины: откуда пришёл заказ / документ.
-- Позволяет считать P&L по каналам: сайт / розница / Prom / Rozetka / опт

CREATE TABLE IF NOT EXISTS sales_channels (
  code        TEXT     PRIMARY KEY,
  name        TEXT     NOT NULL,
  type        TEXT     NOT NULL
                CHECK (type IN ('online','retail','marketplace','b2b','phone','other')),
  is_active   BOOLEAN  NOT NULL DEFAULT true,
  sort_order  INT      DEFAULT 0
);

INSERT INTO sales_channels (code, name, type, sort_order) VALUES
  ('website',  'Інтернет-магазин',       'online',      10),
  ('retail',   'Роздріб (магазин)',       'retail',      20),
  ('b2b',      'Оптові клієнти',          'b2b',         30),
  ('phone',    'Телефонне замовлення',    'phone',       40),
  ('prom',     'Prom.ua',                'marketplace',  50),
  ('rozetka',  'Rozetka',                'marketplace',  60),
  ('olx',      'OLX',                    'marketplace',  70)
ON CONFLICT (code) DO NOTHING;


-- ── 2. Обновление существующих таблиц ─────────────────────────────────────────

-- Канал на бухгалтерских документах
ALTER TABLE acc_documents
  ADD COLUMN IF NOT EXISTS channel_code         TEXT REFERENCES sales_channels(code),
  ADD COLUMN IF NOT EXISTS marketplace_order_id UUID;  -- → marketplace_orders.id (добавим FK ниже)

-- Канал на заказах интернет-магазина
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS channel_code TEXT REFERENCES sales_channels(code) DEFAULT 'website';

UPDATE orders SET channel_code = 'website' WHERE channel_code IS NULL;


-- ── 3. Правила маршрутизации отгрузки ─────────────────────────────────────────
--
-- Определяет с какого склада выполнять заказ.
-- Применяются по приоритету (меньше = выше).
-- Фильтры: NULL = применяется ко всем значениям этого поля.
--
-- Пример:
--   priority=1, channel=website, warehouse=main       → сначала проверяем свой склад
--   priority=2, channel=website, warehouse=supplier-x → потом склад поставщика X
--   priority=3, channel=prom,    warehouse=supplier-y → для Prom — поставщик Y

CREATE TABLE IF NOT EXISTS fulfillment_rules (
  id             SERIAL       PRIMARY KEY,
  name           TEXT         NOT NULL,

  -- Условия применения (NULL = ко всем)
  sku            TEXT         REFERENCES products(sku),
  category_slug  TEXT         REFERENCES categories(slug),
  channel_code   TEXT         REFERENCES sales_channels(code),
  customer_type  TEXT,        -- retail | wholesale | dropship
  region         TEXT,        -- для будущей региональной логики

  -- Источник отгрузки
  warehouse_id   INT          NOT NULL REFERENCES warehouses(id),

  priority       INT          NOT NULL DEFAULT 0,
  is_active      BOOLEAN      NOT NULL DEFAULT true,
  notes          TEXT,
  created_at     TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fulfillment_rules_active
  ON fulfillment_rules(priority) WHERE is_active = true;

-- Дефолтное правило: основной склад для заказов с сайта
INSERT INTO fulfillment_rules (name, channel_code, warehouse_id, priority)
SELECT 'Основний склад → сайт', 'website', id, 1
FROM warehouses WHERE slug = 'main'
ON CONFLICT DO NOTHING;


-- ── 4. Розничные кассы (POS) ──────────────────────────────────────────────────
--
-- Скелет модуля розницы. Интеграция с ПРРО (Checkbox / Vchasno)
-- подключается через fiscal_system + fiscal_id.
-- Кассовая смена (pos_sessions) привязывается к acc_documents через meta.

CREATE TABLE IF NOT EXISTS pos_terminals (
  id              SERIAL       PRIMARY KEY,
  warehouse_id    INT          NOT NULL REFERENCES warehouses(id),
  name            TEXT         NOT NULL,
  fiscal_system   TEXT,        -- 'checkbox' | 'vchasno' | null (без фискала)
  fiscal_id       TEXT,        -- ID кассы/РРО в системе ПРРО
  is_active       BOOLEAN      NOT NULL DEFAULT true,
  settings        JSONB        NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pos_sessions (
  id                   SERIAL       PRIMARY KEY,
  terminal_id          INT          NOT NULL REFERENCES pos_terminals(id),
  session_number       TEXT         NOT NULL,
  status               TEXT         NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open','closed','error')),
  opened_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  closed_at            TIMESTAMPTZ,
  opening_cash         NUMERIC(12,2) NOT NULL DEFAULT 0,
  closing_cash         NUMERIC(12,2),
  opened_by            TEXT,
  closed_by            TEXT,
  fiscal_session_id    TEXT,        -- ID смены в системе ПРРО
  fiscal_session_data  JSONB,       -- полный ответ от ПРРО API
  created_at           TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_sessions_terminal
  ON pos_sessions(terminal_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_sessions_open
  ON pos_sessions(terminal_id) WHERE status = 'open';


-- ── 5. Аккаунты маркетплейсов ─────────────────────────────────────────────────
--
-- Один аккаунт = один магазин на одной платформе.
-- Можно иметь несколько магазинов на одном маркетплейсе.
-- api_credentials шифруются на уровне приложения перед записью.

CREATE TABLE IF NOT EXISTS marketplace_accounts (
  id                     SERIAL       PRIMARY KEY,
  channel_code           TEXT         NOT NULL REFERENCES sales_channels(code),
  platform               TEXT         NOT NULL,  -- 'prom' | 'rozetka' | 'olx' | etc.
  name                   TEXT         NOT NULL,  -- 'Наш магазин на Prom'
  shop_id                TEXT,                   -- наш ID на платформе
  is_active              BOOLEAN      NOT NULL DEFAULT true,

  -- Авторизация (значения зашифрованы на уровне приложения)
  api_credentials        JSONB        NOT NULL DEFAULT '{}',

  -- XML/YML фид (для Prom и аналогичных)
  feed_url               TEXT,        -- публичный URL нашего фида
  feed_token             TEXT,        -- секрет для защиты URL фида
  feed_format            TEXT         DEFAULT 'yml'
                           CHECK (feed_format IN ('yml','xml','csv')),

  -- Комиссия платформы
  commission_pct         NUMERIC(5,2) DEFAULT 0,

  -- Временны́е метки последних синхронизаций
  last_orders_sync_at    TIMESTAMPTZ,
  last_stock_sync_at     TIMESTAMPTZ,
  last_price_sync_at     TIMESTAMPTZ,
  last_products_sync_at  TIMESTAMPTZ,

  -- Платформо-специфичные настройки
  settings               JSONB        NOT NULL DEFAULT '{}',
  created_at             TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mp_accounts_platform
  ON marketplace_accounts(platform) WHERE is_active = true;


-- ── 6. Маппинг статусов ───────────────────────────────────────────────────────
--
-- Каждый маркетплейс имеет свою систему статусов.
-- Эта таблица переводит их в нашу: new | confirmed | shipped | delivered | cancelled

CREATE TABLE IF NOT EXISTS marketplace_status_map (
  marketplace_id   INT   NOT NULL REFERENCES marketplace_accounts(id) ON DELETE CASCADE,
  external_status  TEXT  NOT NULL,
  our_status       TEXT  NOT NULL
                     CHECK (our_status IN ('new','confirmed','shipped','delivered','cancelled')),
  PRIMARY KEY (marketplace_id, external_status)
);


-- ── 7. Листинги товаров на маркетплейсах ──────────────────────────────────────
--
-- Один SKU × один маркетплейс = один листинг.
-- Управляет: какие товары выгружать, по какой цене, сколько штук показывать.
--
-- price_strategy:
--   standard  → берём нашу розничную цену из product_stock
--   override  → price_override (фиксированная цена)
--   formula   → price_formula JSONB, например {"type":"markup_pct","value":5}
--
-- qty_limit   → максимум показываемого остатка (защита от переобещания)
-- qty_buffer  → сколько единиц держать в резерве (не выгружать на платформу)

CREATE TABLE IF NOT EXISTS marketplace_listings (
  id                    SERIAL        PRIMARY KEY,
  marketplace_id        INT           NOT NULL REFERENCES marketplace_accounts(id) ON DELETE CASCADE,
  sku                   TEXT          NOT NULL REFERENCES products(sku),

  -- Идентификаторы на стороне маркетплейса
  external_product_id   TEXT,
  external_sku          TEXT,
  external_category_id  TEXT,         -- ID категории на маркетплейсе (важно для Rozetka)
  external_url          TEXT,         -- ссылка на товар

  -- Ценообразование
  price_strategy        TEXT          NOT NULL DEFAULT 'standard'
                          CHECK (price_strategy IN ('standard','override','formula')),
  price_override        NUMERIC(12,2),
  price_formula         JSONB,        -- {"type":"markup_pct","value":5}

  -- Управление остатком
  qty_limit             INT,          -- NULL = без лимита
  qty_buffer            INT           NOT NULL DEFAULT 0,

  -- Статус листинга
  is_listed             BOOLEAN       NOT NULL DEFAULT true,
  listing_status        TEXT          NOT NULL DEFAULT 'active'
                          CHECK (listing_status IN ('active','pending','rejected','paused','unlisted')),
  listing_status_reason TEXT,

  -- Состояние синхронизации
  needs_sync            BOOLEAN       NOT NULL DEFAULT false,
  last_synced_at        TIMESTAMPTZ,
  last_sync_error       TEXT,
  last_synced_qty       INT,          -- что реально отправили в последний раз
  last_synced_price     NUMERIC(12,2),

  created_at            TIMESTAMPTZ   DEFAULT NOW(),
  meta                  JSONB         NOT NULL DEFAULT '{}',

  UNIQUE (marketplace_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_listings_marketplace
  ON marketplace_listings(marketplace_id, is_listed);
CREATE INDEX IF NOT EXISTS idx_listings_sku
  ON marketplace_listings(sku);
CREATE INDEX IF NOT EXISTS idx_listings_needs_sync
  ON marketplace_listings(marketplace_id, id)
  WHERE needs_sync = true AND is_listed = true;
CREATE INDEX IF NOT EXISTS idx_listings_status
  ON marketplace_listings(marketplace_id, listing_status);


-- ── 8. Заказы с маркетплейсов ─────────────────────────────────────────────────
--
-- Сырой импорт заказов. Один external_order_id = одна запись (идемпотентность).
-- raw_payload хранит полный ответ API — незаменимо при дебаге и при смене API.
-- our_order_id появляется после того как создан заказ в нашей системе.

CREATE TABLE IF NOT EXISTS marketplace_orders (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id      INT           NOT NULL REFERENCES marketplace_accounts(id),

  -- Идентификаторы на маркетплейсе
  external_order_id   TEXT          NOT NULL,
  external_order_num  TEXT,

  -- Связь с нашей системой
  our_order_id        UUID,          -- → orders.id

  -- Данные покупателя (денормализовано из payload для удобства)
  buyer_name          TEXT,
  buyer_phone         TEXT,
  buyer_email         TEXT,
  delivery_address    TEXT,
  delivery_city       TEXT,
  tracking_number     TEXT,         -- если маркетплейс возвращает ТТН

  -- Финансы
  total_amount        NUMERIC(14,2),
  commission_pct      NUMERIC(5,2),
  commission_amount   NUMERIC(14,2) GENERATED ALWAYS AS (
                        CASE WHEN commission_pct IS NOT NULL AND total_amount IS NOT NULL
                             THEN ROUND(total_amount * commission_pct / 100, 2)
                             ELSE NULL END
                      ) STORED,

  -- Статус
  status_external     TEXT          NOT NULL,
  status_mapped       TEXT,         -- наш статус

  -- Полный ответ API (источник истины для пересоздания/дебага)
  raw_payload         JSONB         NOT NULL DEFAULT '{}',

  -- Обработка
  imported_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  processed_at        TIMESTAMPTZ,
  processing_error    TEXT,

  UNIQUE (marketplace_id, external_order_id)
);

CREATE INDEX IF NOT EXISTS idx_mp_orders_marketplace
  ON marketplace_orders(marketplace_id, imported_at DESC);
CREATE INDEX IF NOT EXISTS idx_mp_orders_our_order
  ON marketplace_orders(our_order_id) WHERE our_order_id IS NOT NULL;
-- Заказы ожидающие обработки (не создан our_order_id, нет ошибки)
CREATE INDEX IF NOT EXISTS idx_mp_orders_pending
  ON marketplace_orders(marketplace_id, imported_at)
  WHERE our_order_id IS NULL AND processing_error IS NULL;


-- ── 9. FK: acc_documents.marketplace_order_id ─────────────────────────────────

ALTER TABLE acc_documents DROP CONSTRAINT IF EXISTS fk_acc_doc_mp_order;
ALTER TABLE acc_documents
  ADD CONSTRAINT fk_acc_doc_mp_order
  FOREIGN KEY (marketplace_order_id) REFERENCES marketplace_orders(id);


-- ── 10. Очередь синхронизации ─────────────────────────────────────────────────
--
-- Связующее звено между изменениями в нашей системе и API маркетплейсов.
-- Worker читает pending/error записи и отправляет запросы к API.
--
-- Partial UNIQUE INDEX гарантирует:
--   один pending-элемент на (листинг + тип) — обновляет payload если уже есть.
--
-- Retry логика:
--   status='error' + attempts < max_attempts + retry_after < NOW() → повтор
--   Интервалы: 1мин → 5мин → 15мин → 1час → 6часов

CREATE TABLE IF NOT EXISTS marketplace_sync_queue (
  id              BIGSERIAL    PRIMARY KEY,
  listing_id      INT          NOT NULL REFERENCES marketplace_listings(id) ON DELETE CASCADE,
  sku             TEXT         NOT NULL,
  marketplace_id  INT          NOT NULL REFERENCES marketplace_accounts(id),
  sync_type       TEXT         NOT NULL
                    CHECK (sync_type IN ('stock','price','product_update','listing_status')),
  payload         JSONB        NOT NULL DEFAULT '{}',
  status          TEXT         NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','processing','done','error')),
  attempts        INT          NOT NULL DEFAULT 0,
  max_attempts    INT          NOT NULL DEFAULT 5,
  retry_after     TIMESTAMPTZ,
  queued_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ,
  error_message   TEXT
);

-- Один pending на (листинг + тип) — при повторном изменении просто обновляем payload
CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_one_pending
  ON marketplace_sync_queue(listing_id, sync_type)
  WHERE status = 'pending';

-- Индекс для воркера (retry_after < NOW() фильтруется в запросе, не в предикате)
CREATE INDEX IF NOT EXISTS idx_queue_processable
  ON marketplace_sync_queue(marketplace_id, queued_at)
  WHERE status IN ('pending', 'error');


-- ── 11. Лог синхронизаций ─────────────────────────────────────────────────────
--
-- История каждой операции синхронизации. Детальная статистика.
-- Используется для мониторинга здоровья интеграции.

CREATE TABLE IF NOT EXISTS marketplace_sync_log (
  id               SERIAL       PRIMARY KEY,
  marketplace_id   INT          NOT NULL REFERENCES marketplace_accounts(id),
  sync_type        TEXT         NOT NULL,  -- orders | stock | prices | products | feed
  direction        TEXT         NOT NULL   CHECK (direction IN ('inbound','outbound')),
  triggered_by     TEXT         NOT NULL   DEFAULT 'cron'
                     CHECK (triggered_by IN ('cron','webhook','manual')),
  status           TEXT         NOT NULL   DEFAULT 'running'
                     CHECK (status IN ('running','success','error','partial')),
  records_total    INT          NOT NULL DEFAULT 0,
  records_ok       INT          NOT NULL DEFAULT 0,
  records_error    INT          NOT NULL DEFAULT 0,
  records_skipped  INT          NOT NULL DEFAULT 0,
  error_details    TEXT,
  started_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  finished_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sync_log_marketplace
  ON marketplace_sync_log(marketplace_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_log_errors
  ON marketplace_sync_log(marketplace_id, sync_type)
  WHERE status IN ('error','partial');


-- ── 12. Триггер: изменение остатка → очередь синхронизации ───────────────────
--
-- Срабатывает после каждого обновления stock_balance.
-- Ставит needs_sync = true на листингах и добавляет в queue.
-- ON CONFLICT обновляет payload (берём актуальный остаток, не устаревший).

CREATE OR REPLACE FUNCTION fn_queue_stock_sync()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_qty_available NUMERIC;
BEGIN
  IF OLD.qty_total IS DISTINCT FROM NEW.qty_total
    OR OLD.qty_reserved IS DISTINCT FROM NEW.qty_reserved
  THEN
    -- Помечаем листинги как требующие синхронизации
    UPDATE marketplace_listings ml
    SET needs_sync = true
    FROM marketplace_accounts ma
    WHERE ml.sku = NEW.sku
      AND ml.marketplace_id = ma.id
      AND ml.is_listed = true
      AND ma.is_active = true;

    -- Добавляем в очередь (один pending на листинг — обновляем если уже есть)
    INSERT INTO marketplace_sync_queue
      (listing_id, sku, marketplace_id, sync_type, payload)
    SELECT
      ml.id,
      NEW.sku,
      ml.marketplace_id,
      'stock',
      jsonb_build_object('qty',
        GREATEST(0,
          COALESCE(NEW.qty_available, 0) - COALESCE(ml.qty_buffer, 0)
        )
      )
    FROM marketplace_listings ml
    JOIN marketplace_accounts ma ON ml.marketplace_id = ma.id
    WHERE ml.sku = NEW.sku
      AND ml.is_listed = true
      AND ma.is_active = true
    ON CONFLICT (listing_id, sync_type) WHERE status = 'pending'
    DO UPDATE SET
      payload   = EXCLUDED.payload,
      queued_at = NOW();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_to_marketplace_queue ON stock_balance;
CREATE TRIGGER trg_stock_to_marketplace_queue
  AFTER UPDATE ON stock_balance
  FOR EACH ROW EXECUTE FUNCTION fn_queue_stock_sync();


-- ── 13. Триггер: изменение цены → очередь синхронизации ──────────────────────
--
-- Срабатывает после записи в price_history.
-- Ставит в queue только листинги со стратегией 'standard'
-- (override и formula не зависят от нашей базовой цены).

CREATE OR REPLACE FUNCTION fn_queue_price_sync()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.price_type IN ('retail','wholesale','drop') THEN
    INSERT INTO marketplace_sync_queue
      (listing_id, sku, marketplace_id, sync_type, payload)
    SELECT
      ml.id,
      NEW.sku,
      ml.marketplace_id,
      'price',
      jsonb_build_object(
        'price_type', NEW.price_type,
        'price_new',  NEW.price_new
      )
    FROM marketplace_listings ml
    JOIN marketplace_accounts ma ON ml.marketplace_id = ma.id
    WHERE ml.sku = NEW.sku
      AND ml.is_listed = true
      AND ml.price_strategy = 'standard'
      AND ma.is_active = true
    ON CONFLICT (listing_id, sync_type) WHERE status = 'pending'
    DO UPDATE SET
      payload   = EXCLUDED.payload,
      queued_at = NOW();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_price_to_marketplace_queue ON price_history;
CREATE TRIGGER trg_price_to_marketplace_queue
  AFTER INSERT ON price_history
  FOR EACH ROW EXECUTE FUNCTION fn_queue_price_sync();


-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE sales_channels          ENABLE ROW LEVEL SECURITY;
ALTER TABLE fulfillment_rules        ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_terminals            ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_sessions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_accounts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_status_map   ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_listings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_sync_queue   ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_sync_log     ENABLE ROW LEVEL SECURITY;


-- ╔══════════════════════════════════════════════════════════╗
-- ║  010_customers_webhooks_promo.sql                      ║
-- ╚══════════════════════════════════════════════════════════╝

-- ============================================================
-- Клиенты, вебхуки, промо, история статусов заказов
-- ============================================================
--
-- БЛОКИ:
--   1. customers           — сущность покупателя (розница / опт / дропшип-партнёр)
--   2. order_status_history — история смены статусов заказов (триггер)
--   3. webhook_events      — идемпотентная очередь входящих вебхуков
--   4. promo_codes         — промокоды и скидки
--   5. Дополнения orders   — customer_id, UTM-поля
--   6. Дополнения suppliers — условия работы (оплата, сроки, минималка)
-- ============================================================


-- ── 1. Клиенты ────────────────────────────────────────────────────────────────
--
-- type:
--   retail           — розничный покупатель
--   wholesale        — оптовый клиент (B2B)
--   dropship_partner — перепродавец, который продаёт наши товары своим клиентам
--   b2b              — корпоративный клиент (разовые крупные закупки)
--
-- price_tier — к какому прайсу привязан: retail | wholesale | drop
-- credit_limit / payment_terms_days — для оптовых (отсрочка платежа)
-- commission_pct — для дропшип-партнёров (их маржа с наших продаж)
-- partner_code — уникальный код партнёра (для идентификации источника заказа)
-- auth_user_id — связь с аккаунтом на сайте (Supabase Auth)
-- tax_number — ИПН / ЄДРПОУ (для счётов-фактур)

CREATE TABLE IF NOT EXISTS customers (
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Тип и ценовой уровень
  type                 TEXT          NOT NULL DEFAULT 'retail'
                         CHECK (type IN ('retail','wholesale','dropship_partner','b2b')),
  price_tier           TEXT          NOT NULL DEFAULT 'retail'
                         CHECK (price_tier IN ('retail','wholesale','drop')),

  -- Основные данные
  name                 TEXT          NOT NULL,
  company              TEXT,
  legal_name           TEXT,         -- официальное название для документов
  tax_number           TEXT,         -- ИПН или ЄДРПОУ
  phone                TEXT,
  email                TEXT,

  -- Адрес (основной; доп. адреса — в meta или отдельной таблице позже)
  city                 TEXT,
  address              TEXT,

  -- B2B / оптовые условия
  credit_limit         NUMERIC(14,2),     -- NULL = без кредита (только предоплата)
  payment_terms_days   INT,               -- дней отсрочки; NULL = предоплата
  discount_pct         NUMERIC(5,2),      -- персональная скидка %

  -- Дропшип-партнёр
  commission_pct       NUMERIC(5,2),      -- % маржи партнёра с каждого заказа
  partner_code         TEXT UNIQUE,       -- уникальный код (UTM-источник, реф. ссылка)

  -- Связь с сайтом
  auth_user_id         UUID UNIQUE,       -- → auth.users.id (Supabase Auth)

  -- Статистика (обновляется триггером / фоновым заданием)
  orders_count         INT           NOT NULL DEFAULT 0,
  total_revenue        NUMERIC(14,2) NOT NULL DEFAULT 0,
  last_order_at        TIMESTAMPTZ,

  is_active            BOOLEAN       NOT NULL DEFAULT true,
  notes                TEXT,
  created_at           TIMESTAMPTZ   DEFAULT NOW(),
  updated_at           TIMESTAMPTZ   DEFAULT NOW(),
  meta                 JSONB         NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_customers_type      ON customers(type) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_customers_phone     ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_email     ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_partner   ON customers(partner_code) WHERE partner_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_auth_user ON customers(auth_user_id) WHERE auth_user_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_customers_updated_at ON customers;
CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ── 2. Привязка клиентов к существующим таблицам ──────────────────────────────

-- Заказы интернет-магазина → клиент
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id);

-- Бухгалтерские документы → клиент
ALTER TABLE acc_documents
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id);

CREATE INDEX IF NOT EXISTS idx_orders_customer    ON orders(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_acc_doc_customer   ON acc_documents(customer_id) WHERE customer_id IS NOT NULL;


-- ── 3. История статусов заказа ────────────────────────────────────────────────
--
-- Append-only. Писать вручную нельзя — только через триггер на orders.status.
-- Даёт: когда и кто сменил статус, среднее время обработки, аудит.

CREATE TABLE IF NOT EXISTS order_status_history (
  id           BIGSERIAL    PRIMARY KEY,
  order_id     UUID         NOT NULL,  -- → orders.id
  status_from  TEXT,                   -- NULL при первой записи
  status_to    TEXT         NOT NULL,
  changed_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  changed_by   TEXT,                   -- email пользователя или 'system'
  notes        TEXT
);

CREATE INDEX IF NOT EXISTS idx_order_status_order
  ON order_status_history(order_id, changed_at DESC);

-- Триггер: автоматически пишет историю при изменении orders.status
CREATE OR REPLACE FUNCTION fn_track_order_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO order_status_history (order_id, status_from, status_to, changed_by)
    VALUES (NEW.id::UUID, OLD.status, NEW.status, current_setting('app.current_user', true));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_status_history ON orders;
CREATE TRIGGER trg_order_status_history
  AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION fn_track_order_status();


-- ── 4. UTM и источник заказа ──────────────────────────────────────────────────
--
-- Откуда пришёл заказ: Google Ads, email, Instagram, партнёр.
-- Даёт ROI по рекламным каналам.
-- referrer_url — исходная страница (до перехода на сайт).

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS utm_source    TEXT,   -- google | facebook | email | partner
  ADD COLUMN IF NOT EXISTS utm_medium    TEXT,   -- cpc | organic | referral | newsletter
  ADD COLUMN IF NOT EXISTS utm_campaign  TEXT,   -- название кампании
  ADD COLUMN IF NOT EXISTS utm_content   TEXT,   -- вариант объявления
  ADD COLUMN IF NOT EXISTS utm_term      TEXT,   -- ключевое слово
  ADD COLUMN IF NOT EXISTS referrer_url  TEXT,   -- полный URL источника
  ADD COLUMN IF NOT EXISTS partner_code  TEXT;   -- код дропшип-партнёра (→ customers.partner_code)

CREATE INDEX IF NOT EXISTS idx_orders_utm_source
  ON orders(utm_source) WHERE utm_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_partner_code
  ON orders(partner_code) WHERE partner_code IS NOT NULL;


-- ── 5. Вебхуки (идемпотентная очередь) ───────────────────────────────────────
--
-- Все входящие вебхуки от маркетплейсов, платёжных систем и т.д.
-- попадают сюда первым делом — ещё до обработки.
--
-- Принцип:
--   1. Получили вебхук → сразу сохранили raw_payload → ответили 200
--   2. Worker берёт pending записи и обрабатывает асинхронно
--   3. Если обработка упала — статус error + retry
--   4. UNIQUE (source, external_event_id) — дубль игнорируется
--
-- source: prom | rozetka | olx | nova_poshta | liqpay | mono | wayforpay | fondy
-- event_type: order.new | order.status_changed | payment.confirmed | etc.

CREATE TABLE IF NOT EXISTS webhook_events (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  source            TEXT          NOT NULL,
  event_type        TEXT          NOT NULL,
  external_event_id TEXT,                     -- ID события от источника
  raw_headers       JSONB         NOT NULL DEFAULT '{}',
  raw_payload       JSONB         NOT NULL DEFAULT '{}',
  status            TEXT          NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','processing','processed','failed','ignored')),
  attempts          INT           NOT NULL DEFAULT 0,
  max_attempts      INT           NOT NULL DEFAULT 3,
  retry_after       TIMESTAMPTZ,
  processed_at      TIMESTAMPTZ,
  processing_error  TEXT,
  -- Что создала обработка
  related_order_id         UUID,
  related_marketplace_order_id UUID REFERENCES marketplace_orders(id),
  received_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Идемпотентность: один внешний event_id от одного источника = одна запись
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_unique
  ON webhook_events(source, external_event_id)
  WHERE external_event_id IS NOT NULL;

-- Индекс для воркера
CREATE INDEX IF NOT EXISTS idx_webhook_events_pending
  ON webhook_events(source, received_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_webhook_events_retry
  ON webhook_events(retry_after)
  WHERE status = 'failed' AND attempts < max_attempts;


-- ── 6. Промокоды ──────────────────────────────────────────────────────────────
--
-- discount_type:
--   percent       — скидка в % от суммы заказа
--   fixed         — фиксированная скидка в грн
--   free_shipping — бесплатная доставка
--
-- Условия применения (NULL = без ограничения):
--   min_order_amount    — минимальная сумма заказа
--   applicable_channels — только для этих каналов продаж
--   applicable_skus     — только для этих товаров
--   applicable_categories — только для этих категорий
--   customer_types      — только для этих типов клиентов
--
-- max_uses / max_uses_per_customer — лимиты использования

CREATE TABLE IF NOT EXISTS promo_codes (
  id                    UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  TEXT           UNIQUE NOT NULL,
  description           TEXT,

  -- Тип и размер скидки
  discount_type         TEXT           NOT NULL
                          CHECK (discount_type IN ('percent','fixed','free_shipping')),
  discount_value        NUMERIC(10,2)  NOT NULL CHECK (discount_value > 0),
  max_discount_amount   NUMERIC(14,2),           -- потолок скидки (для percent)

  -- Условия применения
  min_order_amount      NUMERIC(14,2),
  applicable_channels   TEXT[],                  -- NULL = все каналы
  applicable_skus       TEXT[],                  -- NULL = все товары
  applicable_categories TEXT[],                  -- NULL = все категории
  customer_types        TEXT[],                  -- NULL = все типы клиентов

  -- Лимиты
  max_uses              INT,                     -- NULL = безлимитно
  max_uses_per_customer INT           NOT NULL DEFAULT 1,
  uses_count            INT           NOT NULL DEFAULT 0,

  -- Период действия
  valid_from            TIMESTAMPTZ,
  valid_until           TIMESTAMPTZ,

  is_active             BOOLEAN       NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ   DEFAULT NOW(),
  created_by            TEXT
);

CREATE INDEX IF NOT EXISTS idx_promo_codes_active
  ON promo_codes(code) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_promo_codes_validity
  ON promo_codes(valid_until) WHERE is_active = true;


-- ── 7. Использования промокодов ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS promo_code_uses (
  id               BIGSERIAL      PRIMARY KEY,
  promo_id         UUID           NOT NULL REFERENCES promo_codes(id),
  order_id         UUID           NOT NULL,
  customer_id      UUID           REFERENCES customers(id),
  discount_amount  NUMERIC(14,2)  NOT NULL,
  used_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  UNIQUE (promo_id, order_id)   -- один промокод на один заказ
);

CREATE INDEX IF NOT EXISTS idx_promo_uses_promo    ON promo_code_uses(promo_id);
CREATE INDEX IF NOT EXISTS idx_promo_uses_customer ON promo_code_uses(customer_id);

-- Триггер: увеличивает счётчик при использовании промокода
CREATE OR REPLACE FUNCTION fn_increment_promo_uses()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE promo_codes SET uses_count = uses_count + 1 WHERE id = NEW.promo_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_promo_uses_count ON promo_code_uses;
CREATE TRIGGER trg_promo_uses_count
  AFTER INSERT ON promo_code_uses
  FOR EACH ROW EXECUTE FUNCTION fn_increment_promo_uses();

-- Добавить promo_id на заказы
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS promo_id       UUID REFERENCES promo_codes(id),
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14,2) DEFAULT 0;


-- ── 8. Условия работы с поставщиками ─────────────────────────────────────────
--
-- Дополняет существующую таблицу suppliers:
--   min_order_amount    — минимальная сумма заказа (для purchase_order)
--   payment_terms       — prepayment | credit
--   payment_terms_days  — дней отсрочки (если credit)
--   lead_time_days      — среднее время поставки (для прогноза поступлений)
--   return_policy       — условия возврата (свободный текст)
--   account_number      — реквизиты для оплаты

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS min_order_amount    NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS payment_terms       TEXT DEFAULT 'prepayment'
                             CHECK (payment_terms IN ('prepayment','credit','mixed')),
  ADD COLUMN IF NOT EXISTS payment_terms_days  INT,
  ADD COLUMN IF NOT EXISTS lead_time_days      INT,
  ADD COLUMN IF NOT EXISTS return_policy       TEXT,
  ADD COLUMN IF NOT EXISTS account_number      TEXT,
  ADD COLUMN IF NOT EXISTS contact_person      TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone       TEXT;


-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE customers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_codes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_code_uses      ENABLE ROW LEVEL SECURITY;


-- ╔══════════════════════════════════════════════════════════╗
-- ║  011_uom_prices_currency.sql                           ║
-- ╚══════════════════════════════════════════════════════════╝

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

