-- 120: «Коригування боргу» — аналог однойменного документа 1С.
--
-- Навіщо. Перенесення оплати із загубленого замовлення на його копію (17.09.2026,
-- #26091089 → #26091160) робилось руками двома ваучерами. Документ дає одну
-- операцію з проводками, що одразу правлять і сальдо контрагента, і стан
-- замовлення, і має штатне скасування.
--
-- Види операцій (рядок документа = одна проводка):
--   transfer  — перенесення боргу/оплати: DR сторона-звідки / CR сторона-куди
--               (клієнт→клієнт, замовлення→замовлення, постачальник→постачальник)
--   offset    — взаємозалік: DR supplier[Y] / CR customer[X]
--   write_off — списання: DR correction / CR сторона (прощення боргу) або
--               DR сторона / CR correction (переплата → дохід)
--
-- Чому окрема таблиця рядків: acc_document_lines — товарні (sku NOT NULL), а тут
-- рядок описує дві сторони проводки з різними order_id.
--
-- Чому своя SQL-функція: record_money_txn ставить ОДИН order_id на обидві ноги,
-- а перенесення між замовленнями мусить мати різний order_id на дебеті й кредиті —
-- інакше «₴ ВИПЛАЧЕНО» по замовленнях (order-settlement) не зійдеться.

INSERT INTO acc_doc_types (code, name, direction, sort_order)
VALUES ('debt_adjustment', 'Коригування боргу', 'none', 105)
ON CONFLICT (code) DO NOTHING;

INSERT INTO acc_doc_sequences (doc_type, prefix, year, last_number)
VALUES ('debt_adjustment', 'КБ', EXTRACT(YEAR FROM NOW())::INT, 0)
ON CONFLICT (doc_type) DO NOTHING;

CREATE TABLE IF NOT EXISTS debt_adjustment_lines (
  id               BIGSERIAL     PRIMARY KEY,
  document_id      UUID          NOT NULL REFERENCES acc_documents(id) ON DELETE CASCADE,
  line_no          INT           NOT NULL,
  op               TEXT          NOT NULL CHECK (op IN ('transfer', 'offset', 'write_off')),
  debit_account    TEXT          NOT NULL CHECK (debit_account  IN ('customer', 'supplier', 'correction')),
  debit_party      TEXT,
  debit_order_id   UUID          REFERENCES orders(id) ON DELETE SET NULL,
  credit_account   TEXT          NOT NULL CHECK (credit_account IN ('customer', 'supplier', 'correction')),
  credit_party     TEXT,
  credit_order_id  UUID          REFERENCES orders(id) ON DELETE SET NULL,
  amount           NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  note             TEXT,
  txn_id           UUID,             -- проводка при проведенні
  reversal_txn_id  UUID,             -- зворотна проводка при скасуванні
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, line_no)
);

CREATE INDEX IF NOT EXISTS idx_debt_adj_lines_doc ON debt_adjustment_lines(document_id);

ALTER TABLE debt_adjustment_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS internal_only ON debt_adjustment_lines;
CREATE POLICY internal_only ON debt_adjustment_lines FOR ALL USING (false);

-- Проводка з окремими order_id / contract_id на дебеті й кредиті.
-- Ідемпотентність — як у record_money_txn: повторний виклик із тим самим ключем
-- повертає наявний txn_id. Захист закритого періоду — тригером на money_entries.
CREATE OR REPLACE FUNCTION public.record_money_txn_legs(
  p_debit_account     TEXT,
  p_debit_party       TEXT,
  p_debit_order_id    UUID,
  p_debit_contract_id UUID,
  p_credit_account    TEXT,
  p_credit_party      TEXT,
  p_credit_order_id   UUID,
  p_credit_contract_id UUID,
  p_amount            NUMERIC,
  p_business_date     DATE  DEFAULT CURRENT_DATE,
  p_doc_id            UUID  DEFAULT NULL,
  p_doc_type          TEXT  DEFAULT NULL,
  p_description       TEXT  DEFAULT NULL,
  p_idempotency_key   TEXT  DEFAULT NULL,
  p_created_by        TEXT  DEFAULT NULL,
  p_meta              JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_txn_id UUID := gen_random_uuid();
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Сума проводки має бути більшою за нуль';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT txn_id INTO v_txn_id FROM money_entries WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF FOUND THEN RETURN v_txn_id; END IF;
    v_txn_id := gen_random_uuid();
  END IF;

  INSERT INTO money_entries
    (txn_id, account_type, counterparty_id, contract_id, amount, currency,
     doc_id, doc_type, order_id, description, idempotency_key, business_date, created_by, meta)
  VALUES
    (v_txn_id, p_debit_account, p_debit_party, p_debit_contract_id, p_amount, 'UAH',
     p_doc_id, p_doc_type, p_debit_order_id, p_description, p_idempotency_key, p_business_date, p_created_by, p_meta);

  INSERT INTO money_entries
    (txn_id, account_type, counterparty_id, contract_id, amount, currency,
     doc_id, doc_type, order_id, description, business_date, created_by, meta)
  VALUES
    (v_txn_id, p_credit_account, p_credit_party, p_credit_contract_id, -p_amount, 'UAH',
     p_doc_id, p_doc_type, p_credit_order_id, p_description, p_business_date, p_created_by, p_meta);

  RETURN v_txn_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_money_txn_legs(
  TEXT, TEXT, UUID, UUID, TEXT, TEXT, UUID, UUID, NUMERIC, DATE, UUID, TEXT, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;

-- Рядки order_payments для перенесення: від'ємний рядок на замовленні-звідки,
-- додатний на замовленні-куди. amount_paid = Σ нескасованих рядків, тому знак
-- працює сам собою; спосіб 'adjustment' відрізняє їх від живих грошей.
ALTER TABLE order_payments DROP CONSTRAINT IF EXISTS order_payments_amount_check;
ALTER TABLE order_payments ADD CONSTRAINT order_payments_amount_check CHECK (amount <> 0);

ALTER TABLE order_payments DROP CONSTRAINT IF EXISTS order_payments_payment_mode_check;
ALTER TABLE order_payments ADD CONSTRAINT order_payments_payment_mode_check
  CHECK (payment_mode = ANY (ARRAY['cash', 'transfer', 'card', 'acquiring', 'adjustment']));

ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS doc_id UUID;   -- → acc_documents.id (КБ)
