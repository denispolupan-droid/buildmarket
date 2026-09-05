-- 110: дебіторка за контрагентом, а не за договором + статус «еквайринг» у виписці Monobank
--
-- Контекст (розбір 2026-09-05): view ar_balances сумував money_entries ЛИШЕ по contract_id.
-- Оплати без договору (вебхук Monobank, повернення, скрипти відновлення) випадали, і
-- екран «Борги» показував Лукашевичу 1 454 замість 928, ФОП ПП 83 замість 8; клієнти
-- без договору (189 з 194) були невидимі взагалі. Тепер баланс = Σ проводок по
-- counterparty_id (те саме, що counterparty_balances), а договір — атрибут рядка
-- (останній активний, якщо є). Службові дебітори (np:cod, mp:prom, mp:rozetka, guest)
-- теж потрапляють у view — за Варіантом B саме вони тримають транзит НП і площадок.

-- DROP, а не REPLACE: COALESCE міняє типи колонок (numeric(18,4) → numeric), а
-- CREATE OR REPLACE VIEW такого не дозволяє. Залежних view немає.
DROP VIEW IF EXISTS ar_balances;
CREATE VIEW ar_balances AS
WITH bal AS (
  SELECT counterparty_id AS customer_id,
         SUM(amount)               AS balance,
         COUNT(DISTINCT txn_id)    AS txn_count
  FROM money_entries
  WHERE account_type = 'customer' AND counterparty_id IS NOT NULL
  GROUP BY counterparty_id
),
contract AS (
  SELECT DISTINCT ON (customer_id::text)
         customer_id::text AS customer_id, id, contract_number, customer_name,
         credit_days, credit_limit, currency, status
  FROM customer_contracts
  ORDER BY customer_id::text, (status = 'active') DESC, created_at DESC
)
SELECT
  c.id                                   AS contract_id,
  c.contract_number,
  b.customer_id,
  COALESCE(NULLIF(cu.company, ''), NULLIF(cu.legal_name, ''), cu.name, c.customer_name) AS customer_name,
  COALESCE(c.credit_days, 0)             AS credit_days,
  COALESCE(c.credit_limit, 0)            AS credit_limit,
  COALESCE(c.currency, 'UAH')            AS currency,
  COALESCE(c.status, 'none')             AS contract_status,
  b.balance,
  b.txn_count
FROM bal b
LEFT JOIN contract  c  ON c.customer_id = b.customer_id
LEFT JOIN customers cu ON cu.id::text   = b.customer_id;

-- Рядок виписки «Покриття за проведені трансакції … еквайринга» — не оплата покупця
-- (вона вже записана вебхуком), а переказ банку. Окремий статус, щоб не плутати з
-- unmatched (які чекають ручної сверки).
ALTER TABLE mono_bank_txns DROP CONSTRAINT IF EXISTS mono_bank_txns_status_check;
ALTER TABLE mono_bank_txns ADD CONSTRAINT mono_bank_txns_status_check
  CHECK (status IN ('matched', 'unmatched', 'acquiring'));
