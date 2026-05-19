-- ══════════════════════════════════════════════════════════════════════════════
-- 029: Клієнтські договори, AR, коригування боргу
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Договори з клієнтами ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS customer_contracts (
  id               UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_number  TEXT         NOT NULL,
  customer_id      TEXT         NOT NULL,       -- → customers.id або вільний ідентифікатор
  customer_name    TEXT,                         -- денормалізовано для зручності
  credit_days      INTEGER      NOT NULL DEFAULT 0,   -- дні відстрочки (net 30, net 60...)
  credit_limit     NUMERIC(18,4) NOT NULL DEFAULT 0,  -- кредитний ліміт, 0 = необмежено
  discount_pct     NUMERIC(5,2) NOT NULL DEFAULT 0,   -- знижка за договором %
  allow_promo      BOOLEAN      NOT NULL DEFAULT FALSE,
  payment_terms    TEXT,                         -- опис умов оплати (довільний текст)
  price_type       TEXT,                         -- тип цін: 'retail'|'wholesale'|'contract'
  currency         TEXT         NOT NULL DEFAULT 'UAH',
  start_date       DATE         NOT NULL,
  end_date         DATE,                         -- NULL = безстроковий
  status           TEXT         NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','suspended','closed')),
  notes            TEXT,
  created_at       TIMESTAMPTZ  DEFAULT NOW(),
  created_by       TEXT,
  updated_at       TIMESTAMPTZ  DEFAULT NOW(),

  -- Унікальний номер договору по клієнту
  UNIQUE (customer_id, contract_number)
);

CREATE INDEX IF NOT EXISTS idx_contracts_customer ON customer_contracts (customer_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status   ON customer_contracts (status);

-- ── 2. Зв'язок money_entries → customer_contracts ─────────────────────────────
-- (FK додається після створення таблиці)
ALTER TABLE money_entries
  ADD CONSTRAINT fk_money_contract
  FOREIGN KEY (contract_id) REFERENCES customer_contracts(id) ON DELETE SET NULL;

-- ── 3. Документ коригування боргу ────────────────────────────────────────────
--
-- Типи операцій:
--   transfer_client   — перенос боргу між клієнтами
--   transfer_contract — перенос між договорами одного клієнта
--   writeoff          — списання безнадійного боргу
--   advance_offset    — залік авансу в рахунок заборгованості
--   manual            — ручне коригування з поясненням

CREATE TABLE IF NOT EXISTS ar_corrections (
  id                UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  doc_number        TEXT         NOT NULL UNIQUE,
  correction_type   TEXT         NOT NULL
                      CHECK (correction_type IN (
                        'transfer_client','transfer_contract',
                        'writeoff','advance_offset','manual'
                      )),
  from_contract_id  UUID         REFERENCES customer_contracts(id),
  to_contract_id    UUID         REFERENCES customer_contracts(id),
  from_customer_id  TEXT,
  to_customer_id    TEXT,
  amount            NUMERIC(18,4) NOT NULL CHECK (amount > 0),
  currency          TEXT         NOT NULL DEFAULT 'UAH',
  reason            TEXT         NOT NULL,
  status            TEXT         NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','confirmed','cancelled')),
  txn_id            UUID,                  -- → money_entries.txn_id після проведення
  business_date     DATE         NOT NULL DEFAULT CURRENT_DATE,
  created_at        TIMESTAMPTZ  DEFAULT NOW(),
  created_by        TEXT,
  confirmed_at      TIMESTAMPTZ,
  confirmed_by      TEXT,
  cancelled_at      TIMESTAMPTZ,
  cancelled_by      TEXT,
  notes             TEXT
);

CREATE INDEX IF NOT EXISTS idx_ar_corrections_from ON ar_corrections (from_contract_id);
CREATE INDEX IF NOT EXISTS idx_ar_corrections_to   ON ar_corrections (to_contract_id);

-- ── 4. Автонумерація документів коригування ───────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS ar_correction_seq START 1;

CREATE OR REPLACE FUNCTION next_ar_correction_number()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_year TEXT := to_char(NOW(), 'YYYY');
  v_num  INTEGER;
BEGIN
  SELECT nextval('ar_correction_seq') INTO v_num;
  RETURN 'КД-' || v_year || '-' || LPAD(v_num::TEXT, 4, '0');
END;
$$;

-- ── 5. View: поточний стан AR по договорах ────────────────────────────────────

CREATE OR REPLACE VIEW ar_balances AS
SELECT
  cc.id              AS contract_id,
  cc.contract_number,
  cc.customer_id,
  cc.customer_name,
  cc.credit_days,
  cc.credit_limit,
  cc.currency,
  cc.status          AS contract_status,
  COALESCE(SUM(me.amount), 0) AS balance,   -- + = клієнт винен нам
  COUNT(DISTINCT me.txn_id)   AS txn_count
FROM customer_contracts cc
LEFT JOIN money_entries me
  ON me.contract_id = cc.id
  AND me.account_type = 'customer'
GROUP BY cc.id, cc.contract_number, cc.customer_id, cc.customer_name,
         cc.credit_days, cc.credit_limit, cc.currency, cc.status;

-- ── 6. View: деталі взаєморозрахунків (для звіту) ────────────────────────────

CREATE OR REPLACE VIEW ar_transactions AS
SELECT
  me.id,
  me.txn_id,
  me.business_date,
  me.counterparty_id   AS customer_id,
  me.contract_id,
  cc.contract_number,
  cc.customer_name,
  me.amount,
  me.currency,
  me.doc_type,
  me.doc_id,
  me.order_id,
  me.description,
  me.created_at,
  me.created_by,
  CASE
    WHEN me.amount > 0 THEN 'debit'   -- відвантаження / нарахування
    ELSE                    'credit'  -- оплата / коригування
  END AS entry_type
FROM money_entries me
LEFT JOIN customer_contracts cc ON cc.id = me.contract_id
WHERE me.account_type = 'customer'
ORDER BY me.business_date DESC, me.created_at DESC;

-- ── 7. View: Aging — реєстр старіння боргу ───────────────────────────────────

CREATE OR REPLACE VIEW ar_aging AS
WITH balances AS (
  SELECT
    me.contract_id,
    cc.customer_id,
    cc.customer_name,
    cc.contract_number,
    cc.credit_days,
    cc.credit_limit,
    SUM(me.amount) AS balance
  FROM money_entries me
  JOIN customer_contracts cc ON cc.id = me.contract_id
  WHERE me.account_type = 'customer'
  GROUP BY me.contract_id, cc.customer_id, cc.customer_name,
           cc.contract_number, cc.credit_days, cc.credit_limit
  HAVING SUM(me.amount) > 0   -- тільки борги (позитивний баланс)
),
-- Остання дата відвантаження (для розрахунку прострочення)
last_shipment AS (
  SELECT
    contract_id,
    MAX(business_date) AS last_ship_date
  FROM money_entries
  WHERE account_type = 'customer' AND amount > 0
  GROUP BY contract_id
)
SELECT
  b.contract_id,
  b.customer_id,
  b.customer_name,
  b.contract_number,
  b.credit_days,
  b.credit_limit,
  b.balance,
  ls.last_ship_date,
  CURRENT_DATE - ls.last_ship_date               AS days_since_shipment,
  GREATEST(0, (CURRENT_DATE - ls.last_ship_date) - b.credit_days) AS days_overdue,
  CASE
    WHEN (CURRENT_DATE - ls.last_ship_date) <= b.credit_days THEN 'current'
    WHEN (CURRENT_DATE - ls.last_ship_date) <= b.credit_days + 30  THEN '1_30'
    WHEN (CURRENT_DATE - ls.last_ship_date) <= b.credit_days + 60  THEN '31_60'
    WHEN (CURRENT_DATE - ls.last_ship_date) <= b.credit_days + 90  THEN '61_90'
    ELSE '90_plus'
  END AS aging_bucket,
  CASE WHEN b.credit_limit > 0
    THEN ROUND(b.balance / b.credit_limit * 100, 1)
    ELSE NULL
  END AS limit_used_pct
FROM balances b
LEFT JOIN last_shipment ls ON ls.contract_id = b.contract_id;
