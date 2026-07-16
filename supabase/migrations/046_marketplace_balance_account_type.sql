-- Adds 'marketplace_balance' to money_entries.account_type — models the prepaid balance we
-- hold at Rozetka/Prom (topped up manually, drawn down automatically by their commission on
-- each delivered order) as a first-class asset account in the existing double-entry ledger.
-- 'marketplace_fee' already existed in the live constraint (added by an earlier untracked
-- migration) but was unused in TypeScript and in practice — recordMarketplaceCommission was
-- posting to 'correction'/'revenue' instead of an actual expense account.
--
-- NOTE: this ALTER reflects the *live* constraint (verified via MCP against project
-- boaztnparrdoeknajprn immediately before writing this migration) rather than any local
-- migration file, since local files and the live schema have drifted — see the money.ts
-- account_type list for the authoritative live set at time of writing.
alter table money_entries drop constraint if exists money_entries_account_type_check;
alter table money_entries add constraint money_entries_account_type_check check (
  account_type = any (array[
    'customer', 'supplier', 'partner',
    'cash', 'bank', 'acquiring', 'advance',
    'inventory_asset',
    'revenue', 'cogs', 'variance', 'rounding', 'correction',
    'logistics', 'loading', 'customs', 'packaging', 'acquiring_fee',
    'marketplace_fee', 'marketplace_balance',
    'rent', 'salary', 'marketing', 'opex'
  ])
);
