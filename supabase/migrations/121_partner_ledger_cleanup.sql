-- 121: партнер (дропшипер) в обліку — прибираємо дзеркальний тригер, додаємо
-- рахунок безнадійних боргів, пускаємо партнера в «Коригування боргу» (КБ).
--
-- 1. Тригер fn_partner_txn_to_ledger (жив лише в БД, у репозиторії його немає)
--    дублював кожен рядок partner_balance_transactions у money_entries і робив
--    це неправильно: 'top_up' (у коді з підкресленням) падав у гілку «інше» як
--    DR partner / CR variance, тобто поповнення виглядало як борг партнера перед
--    нами; 'charge' (списання під замовлення) визнавав виручку в момент
--    оформлення, хоча продаж проводиться при врученні (confirmDocument +
--    advance_offset). Реальні рухи грошей партнера з 14.09.2026 проводить код
--    (lib/accounting/partner-ledger.ts), тож тригер лише двоїв і псував. На
--    prod він встиг зробити дві проводки 14.09 — сторнуємо їх сьогоднішньою
--    датою (леджер append-only), ключі захищають від повторного прогону.
--
-- 2. bad_debt — витратний рахунок «Списання боргів / компенсації»: прощення
--    боргу клієнта, компенсація партнеру. До цього списання йшло на correction,
--    який у P&L не потрапляє, і прибуток такі втрати не бачив.
--
-- 3. Рядки КБ можуть мати сторону 'partner' (баланс дропшипера) і ногу
--    'bad_debt'. Кабінетний баланс правиться рядком partner_balance_transactions
--    з tx_type 'adjustment' (external_ref = ключ проводки), леджер — самим КБ.

DROP TRIGGER IF EXISTS trg_partner_txn_to_ledger ON partner_balance_transactions;
DROP FUNCTION IF EXISTS public.fn_partner_txn_to_ledger();

ALTER TABLE money_entries DROP CONSTRAINT IF EXISTS money_entries_account_type_check;
ALTER TABLE money_entries ADD CONSTRAINT money_entries_account_type_check
  CHECK (account_type = ANY (ARRAY[
    'customer','supplier','partner','cash','bank','acquiring','novapay','advance',
    'inventory_asset','inventory_transit','revenue','cogs','variance','rounding','correction',
    'logistics','loading','customs','packaging','acquiring_fee','marketplace_fee',
    'marketplace_balance','rent','salary','marketing','opex','taxes','owner','bad_debt'
  ]::text[]));

ALTER TABLE debt_adjustment_lines DROP CONSTRAINT IF EXISTS debt_adjustment_lines_debit_account_check;
ALTER TABLE debt_adjustment_lines ADD CONSTRAINT debt_adjustment_lines_debit_account_check
  CHECK (debit_account IN ('customer', 'supplier', 'partner', 'correction', 'bad_debt'));
ALTER TABLE debt_adjustment_lines DROP CONSTRAINT IF EXISTS debt_adjustment_lines_credit_account_check;
ALTER TABLE debt_adjustment_lines ADD CONSTRAINT debt_adjustment_lines_credit_account_check
  CHECK (credit_account IN ('customer', 'supplier', 'partner', 'correction', 'bad_debt'));

-- Сторно проводок тригера: на кожен його txn_id — компенсуюча проводка з тими
-- самими рахунками/контрагентами і протилежними сумами. Тригер на
-- counterparty_balances перерахує кеш сам. Ключ m121-rev:<id вихідного запису>
-- унікальний, тож повторний прогін нічого не додасть.
INSERT INTO money_entries
  (txn_id, account_type, counterparty_id, contract_id, amount, currency,
   doc_id, doc_type, order_id, description, idempotency_key, business_date, created_by, meta)
SELECT
  md5('m121-rev:' || e.txn_id::text)::uuid,
  e.account_type, e.counterparty_id, e.contract_id, -e.amount, e.currency,
  NULL, 'correction', e.order_id,
  'Сторно дзеркальної проводки тригера fn_partner_txn_to_ledger (міграція 121): ' || COALESCE(e.description, ''),
  'm121-rev:' || e.id::text,
  CURRENT_DATE, 'migration_121',
  jsonb_build_object('source', 'migration_121', 'reversal_of', e.id, 'reversal_of_txn', e.txn_id, 'tx_type', e.meta->>'tx_type')
FROM money_entries e
WHERE e.meta->>'source' = 'partner_balance'
  AND NOT EXISTS (SELECT 1 FROM money_entries r WHERE r.idempotency_key = 'm121-rev:' || e.id::text);
