-- 075: рахунок 'novapay' — гроші, які НоваПей утримує від накладених платежів (COD)
-- за послугою «Контроль оплати». Повноцінний грошовий рахунок (поряд з cash/bank/acquiring):
-- при доставці COD-замовлення гроші визнаються зібраними на novapay (DR novapay / CR np:cod),
-- при виплаті НоваПей → банк вони переходять на bank (Фаза 2, авто через NovaPay API).

ALTER TABLE money_entries DROP CONSTRAINT IF EXISTS money_entries_account_type_check;

ALTER TABLE money_entries ADD CONSTRAINT money_entries_account_type_check
  CHECK (account_type = ANY (ARRAY[
    'customer','supplier','partner','cash','bank','acquiring','novapay','advance',
    'inventory_asset','revenue','cogs','variance','rounding','correction',
    'logistics','loading','customs','packaging','acquiring_fee','marketplace_fee',
    'marketplace_balance','rent','salary','marketing','opex'
  ]::text[]));
