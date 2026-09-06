-- 112: прострочена дебіторка по контрагенту, а не по договору (продовження 110).
--
-- ar_aging сумував проводки лише з contract_id: після ремонту 05.09 борги перенесені
-- проводками без договору, і view досі показував «прострочено 6 880» по п'яти старих
-- договорах, хоча ці клієнти вже нічого не винні. Тепер база — сальдо по
-- counterparty_id (як ar_balances), службові дебітори (np:cod, mp:*, guest, order:*)
-- у прострочення не входять — це транзит, а не борг клієнта. Колонки ті самі, що
-- були (aging/page.tsx читає select('*') і aging_bucket).

DROP VIEW IF EXISTS ar_aging;
CREATE VIEW ar_aging AS
WITH bal AS (
  SELECT counterparty_id AS customer_id, SUM(amount) AS balance
  FROM money_entries
  WHERE account_type = 'customer' AND counterparty_id IS NOT NULL
    AND counterparty_id !~ '^(np:|mp:|guest$|order:)'
  GROUP BY counterparty_id
  HAVING SUM(amount) > 0.01
),
last_shipment AS (
  SELECT counterparty_id AS customer_id, MAX(business_date) AS last_ship_date
  FROM money_entries
  WHERE account_type = 'customer' AND doc_type = 'sale' AND amount > 0
  GROUP BY counterparty_id
),
contract AS (
  SELECT DISTINCT ON (customer_id::text)
         customer_id::text AS customer_id, id, contract_number, customer_name, credit_days, credit_limit
  FROM customer_contracts
  ORDER BY customer_id::text, (status = 'active') DESC, created_at DESC
),
x AS (
  SELECT
    c.id                                                   AS contract_id,
    b.customer_id,
    COALESCE(NULLIF(cu.company, ''), NULLIF(cu.legal_name, ''), cu.name, c.customer_name) AS customer_name,
    c.contract_number,
    COALESCE(c.credit_days, 0)                             AS credit_days,
    COALESCE(c.credit_limit, 0)                            AS credit_limit,
    b.balance,
    ls.last_ship_date,
    (CURRENT_DATE - ls.last_ship_date)                     AS days_since_shipment
  FROM bal b
  LEFT JOIN last_shipment ls ON ls.customer_id = b.customer_id
  LEFT JOIN contract      c  ON c.customer_id  = b.customer_id
  LEFT JOIN customers     cu ON cu.id::text    = b.customer_id
)
SELECT
  contract_id, customer_id, customer_name, contract_number, credit_days, credit_limit,
  balance, last_ship_date, days_since_shipment,
  GREATEST(0, COALESCE(days_since_shipment, 0) - credit_days) AS days_overdue,
  CASE
    WHEN COALESCE(days_since_shipment, 0) <= credit_days      THEN 'current'
    WHEN days_since_shipment <= credit_days + 30              THEN '1_30'
    WHEN days_since_shipment <= credit_days + 60              THEN '31_60'
    WHEN days_since_shipment <= credit_days + 90              THEN '61_90'
    ELSE '90_plus'
  END AS aging_bucket,
  CASE WHEN credit_limit > 0 THEN ROUND(balance / credit_limit * 100, 1) ELSE NULL END AS limit_used_pct
FROM x;
