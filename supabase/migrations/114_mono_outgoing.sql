-- 114: вихідні операції Mono в обліку + рахунки «вилучення власника» і «податки».
--
-- До 09.2026 виписка Mono заходила лише надходженнями (аудит 06.09: за місяць 60 600 ₴
-- списань — перекази на особисту картку власника, підрядники — невидимі в обліку;
-- банк за обліком 34 тис. при живих 42 тис.). Тепер кожен документ виписки, і вхідний,
-- і вихідний, лежить у mono_bank_txns рівно раз; списання категоризує людина на екрані
-- «Банк» (витрата / переказ на NovaPay чи в касу / оплата постачальнику / вилучення
-- власника / податки / ігнор), проводка mono-txn:{id}.

ALTER TABLE mono_bank_txns
  ADD COLUMN IF NOT EXISTS direction  text NOT NULL DEFAULT 'in' CHECK (direction IN ('in', 'out')),
  ADD COLUMN IF NOT EXISTS category   text,
  ADD COLUMN IF NOT EXISTS txn_id     uuid,
  ADD COLUMN IF NOT EXISTS note       text,
  ADD COLUMN IF NOT EXISTS posted_at  timestamptz,
  ADD COLUMN IF NOT EXISTS posted_by  text;

ALTER TABLE mono_bank_txns DROP CONSTRAINT IF EXISTS mono_bank_txns_status_check;
ALTER TABLE mono_bank_txns ADD CONSTRAINT mono_bank_txns_status_check
  CHECK (status IN ('matched', 'unmatched', 'acquiring', 'posted', 'ignored'));

CREATE INDEX IF NOT EXISTS mono_bank_txns_dir_status_idx ON mono_bank_txns (direction, status);

-- Рахунки: owner — вилучення власника (не витрата, не в P&L; дебет = гроші вийшли
-- власнику), taxes — податки/ЄСВ (витрата).
ALTER TABLE money_entries DROP CONSTRAINT IF EXISTS money_entries_account_type_check;
ALTER TABLE money_entries ADD CONSTRAINT money_entries_account_type_check
  CHECK (account_type = ANY (ARRAY[
    'customer','supplier','partner','cash','bank','acquiring','novapay','advance',
    'inventory_asset','inventory_transit','revenue','cogs','variance','rounding','correction',
    'logistics','loading','customs','packaging','acquiring_fee','marketplace_fee',
    'marketplace_balance','rent','salary','marketing','opex','taxes','owner'
  ]::text[]));

ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_expense_type_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_expense_type_check
  CHECK (expense_type = ANY (ARRAY[
    'logistics','loading','customs','packaging','acquiring_fee','marketplace_fee',
    'rent','salary','marketing','opex','taxes','other'
  ]::text[]));
