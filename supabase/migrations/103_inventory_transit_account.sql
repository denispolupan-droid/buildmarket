-- 103: рахунок 'inventory_transit' — товар, переданий постачальником перевізникові,
-- але ще не вручений покупцю.
--
-- До цієї міграції борг перед постачальником по дропшипу виникав у момент ДОСТАВКИ
-- покупцю (postSaleDoc). Постачальник же виписує накладну датою передачі посилки, тож
-- звірка ніколи не сходилась: у середньому 3 дні і ~15 тис. ₴ «невидимого» боргу
-- висіли між відвантаженням і врученням.
--
-- Тепер борг виникає при ВІДВАНТАЖЕННІ (створення РН-чернетки):
--     DR inventory_transit / CR supplier
-- а при доставці собівартість списується вже з транзиту, а не зі складу:
--     DR cogs / CR inventory_transit
--
-- Окремий рахунок (а не inventory_asset) — щоб товар у дорозі не змішувався зі
-- складським залишком: інвентаризація і FIFO працюють по складу, а тут товару
-- фізично в нас немає.
alter table money_entries drop constraint if exists money_entries_account_type_check;
alter table money_entries add constraint money_entries_account_type_check check (
  account_type = any (array[
    'customer', 'supplier', 'partner',
    'cash', 'bank', 'acquiring', 'novapay', 'advance',
    'inventory_asset', 'inventory_transit',
    'revenue', 'cogs', 'variance', 'rounding', 'correction',
    'logistics', 'loading', 'customs', 'packaging', 'acquiring_fee',
    'marketplace_fee', 'marketplace_balance',
    'rent', 'salary', 'marketing', 'opex'
  ])
);
