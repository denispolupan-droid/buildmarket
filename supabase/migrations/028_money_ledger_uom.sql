-- ══════════════════════════════════════════════════════════════════════════════
-- 028: Грошовий леджер (подвійний запис) + UOM (одиниці виміру)
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Одиниці виміру ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS uom (
  code     TEXT PRIMARY KEY,          -- 'pcs','box','pallet','kg','l','m2','m3','bag','roll'
  name     TEXT NOT NULL,             -- 'штука'
  name_uk  TEXT,                      -- 'штука' (for display)
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO uom (code, name, name_uk) VALUES
  ('pcs',    'piece',   'штука'),
  ('box',    'box',     'коробка'),
  ('pallet', 'pallet',  'палета'),
  ('bag',    'bag',     'мішок'),
  ('kg',     'kilogram','кілограм'),
  ('l',      'liter',   'літр'),
  ('m',      'meter',   'метр'),
  ('m2',     'sq.meter','кв. метр'),
  ('m3',     'cu.meter','куб. метр'),
  ('roll',   'roll',    'рулон'),
  ('pack',   'pack',    'упаковка'),
  ('tube',   'tube',    'тюбик'),
  ('bucket', 'bucket',  'відро')
ON CONFLICT (code) DO NOTHING;

-- Конверсія UOM: 1 from_uom = ratio to_uom (для конкретного SKU або глобально)
CREATE TABLE IF NOT EXISTS uom_conversions (
  id        SERIAL PRIMARY KEY,
  sku       TEXT REFERENCES products(sku) ON DELETE CASCADE, -- NULL = глобальне правило
  from_uom  TEXT NOT NULL REFERENCES uom(code),
  to_uom    TEXT NOT NULL REFERENCES uom(code),
  ratio     NUMERIC(18,6) NOT NULL CHECK (ratio > 0),
  UNIQUE (sku, from_uom, to_uom)
);

-- UOM поля на продуктах (всі рухи зберігаються в base_uom)
ALTER TABLE products ADD COLUMN IF NOT EXISTS base_uom     TEXT REFERENCES uom(code) DEFAULT 'pcs';
ALTER TABLE products ADD COLUMN IF NOT EXISTS purchase_uom TEXT REFERENCES uom(code);
ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_uom     TEXT REFERENCES uom(code);
-- 1 purchase_uom = purchase_ratio base_uom (напр. 1 коробка = 12 штук)
ALTER TABLE products ADD COLUMN IF NOT EXISTS purchase_ratio NUMERIC(18,6) NOT NULL DEFAULT 1;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_ratio     NUMERIC(18,6) NOT NULL DEFAULT 1;

-- ── 2. Грошовий леджер (подвійний запис) ─────────────────────────────────────
--
-- Інваріант I2: Σ amount по одному txn_id = 0
-- Знакова конвенція:
--   +amount = дебет рахунку (клієнт нам винен / ми маємо актив)
--   -amount = кредит рахунку (ми отримали оплату / витрата)
--
-- Типи рахунків (account_type):
--   customer    — дебіторська заборгованість клієнтів
--   supplier    — кредиторська заборгованість перед постачальниками
--   partner     — баланс дропшип-партнерів
--   cash        — готівкова каса
--   bank        — банківський рахунок
--   acquiring   — еквайринг (Mono/LiqPay)
--   advance     — авансові платежі (невикористані)
--   revenue     — виручка (операційна)
--   cogs        — собівартість продажів
--   variance    — рахунок розбіжностей (недостачі, некоректні залишки)
--   rounding    — рахунок округлень
--   correction  — коригування боргу

CREATE TABLE IF NOT EXISTS money_entries (
  id               UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  txn_id           UUID         NOT NULL,        -- групує парні записи (Σ = 0)
  account_type     TEXT         NOT NULL,
  counterparty_id  TEXT,                          -- customer_id / supplier_id / partner_id
  contract_id      UUID,                          -- → customer_contracts.id (якщо є)
  amount           NUMERIC(18,4) NOT NULL,        -- знаковий, копійки не використовуємо
  currency         TEXT         NOT NULL DEFAULT 'UAH',
  rate             NUMERIC(18,6) NOT NULL DEFAULT 1,
  doc_id           UUID         REFERENCES acc_documents(id) ON DELETE SET NULL,
  doc_type         TEXT,                          -- тип документа для швидкого фільтру
  order_id         UUID,                          -- → orders.id
  description      TEXT,
  idempotency_key  TEXT         UNIQUE,
  business_date    DATE         NOT NULL,
  created_at       TIMESTAMPTZ  DEFAULT NOW(),
  created_by       TEXT,
  meta             JSONB        DEFAULT '{}'
);

-- Індекси для звітів і пошуку
CREATE INDEX IF NOT EXISTS idx_money_counterparty ON money_entries (counterparty_id, business_date);
CREATE INDEX IF NOT EXISTS idx_money_txn          ON money_entries (txn_id);
CREATE INDEX IF NOT EXISTS idx_money_doc          ON money_entries (doc_id) WHERE doc_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_money_account      ON money_entries (account_type, business_date);
CREATE INDEX IF NOT EXISTS idx_money_contract     ON money_entries (contract_id) WHERE contract_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_money_order        ON money_entries (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_money_idem         ON money_entries (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ── 3. Guard: money_entries — append-only ─────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_guard_money_entries()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'money_entries є append-only. Використовуйте компенсуючий запис.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_money_entries ON money_entries;
CREATE TRIGGER trg_guard_money_entries
  BEFORE UPDATE OR DELETE ON money_entries
  FOR EACH ROW EXECUTE FUNCTION fn_guard_money_entries();

-- ── 4. Матеріалізований баланс контрагентів (кеш для швидкого читання) ───────
-- Інваріант I3: баланс = Σ записів у леджері; прямого запису немає

CREATE TABLE IF NOT EXISTS counterparty_balances (
  counterparty_id  TEXT         NOT NULL,
  account_type     TEXT         NOT NULL,
  currency         TEXT         NOT NULL DEFAULT 'UAH',
  balance          NUMERIC(18,4) NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ  DEFAULT NOW(),
  PRIMARY KEY (counterparty_id, account_type, currency)
);

-- Тригер: оновлює баланс при кожному новому entry
CREATE OR REPLACE FUNCTION fn_update_counterparty_balance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.counterparty_id IS NOT NULL THEN
    INSERT INTO counterparty_balances (counterparty_id, account_type, currency, balance)
    VALUES (NEW.counterparty_id, NEW.account_type, NEW.currency, NEW.amount)
    ON CONFLICT (counterparty_id, account_type, currency)
    DO UPDATE SET
      balance    = counterparty_balances.balance + NEW.amount,
      updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_balance ON money_entries;
CREATE TRIGGER trg_update_balance
  AFTER INSERT ON money_entries
  FOR EACH ROW EXECUTE FUNCTION fn_update_counterparty_balance();

-- ── 5. Допоміжна функція: записати транзакцію (пару записів) ─────────────────

CREATE OR REPLACE FUNCTION record_money_txn(
  p_debit_account   TEXT,
  p_debit_party     TEXT,
  p_credit_account  TEXT,
  p_credit_party    TEXT,
  p_amount          NUMERIC,
  p_currency        TEXT DEFAULT 'UAH',
  p_business_date   DATE DEFAULT CURRENT_DATE,
  p_doc_id          UUID DEFAULT NULL,
  p_doc_type        TEXT DEFAULT NULL,
  p_order_id        UUID DEFAULT NULL,
  p_contract_id     UUID DEFAULT NULL,
  p_description     TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_created_by      TEXT DEFAULT NULL,
  p_meta            JSONB DEFAULT '{}'
)
RETURNS UUID  -- повертає txn_id
LANGUAGE plpgsql AS $$
DECLARE
  v_txn_id UUID := gen_random_uuid();
BEGIN
  -- Перевірка ідемпотентності
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM money_entries WHERE idempotency_key = p_idempotency_key) THEN
      SELECT txn_id INTO v_txn_id FROM money_entries WHERE idempotency_key = p_idempotency_key LIMIT 1;
      RETURN v_txn_id;
    END IF;
  END IF;

  -- Дебетовий запис (+)
  INSERT INTO money_entries
    (txn_id, account_type, counterparty_id, contract_id, amount, currency,
     doc_id, doc_type, order_id, description, idempotency_key, business_date, created_by, meta)
  VALUES
    (v_txn_id, p_debit_account, p_debit_party, p_contract_id, p_amount, p_currency,
     p_doc_id, p_doc_type, p_order_id, p_description,
     p_idempotency_key, p_business_date, p_created_by, p_meta);

  -- Кредитовий запис (-)
  INSERT INTO money_entries
    (txn_id, account_type, counterparty_id, contract_id, amount, currency,
     doc_id, doc_type, order_id, description, business_date, created_by, meta)
  VALUES
    (v_txn_id, p_credit_account, p_credit_party, p_contract_id, -p_amount, p_currency,
     p_doc_id, p_doc_type, p_order_id, p_description,
     p_business_date, p_created_by, p_meta);

  RETURN v_txn_id;
END;
$$;
