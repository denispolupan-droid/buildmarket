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
