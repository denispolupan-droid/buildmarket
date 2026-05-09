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
