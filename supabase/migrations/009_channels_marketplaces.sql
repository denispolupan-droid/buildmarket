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
