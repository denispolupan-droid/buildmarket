-- 113: виписка рахунку NovaPay в обліку (аудит K3 / «Фаза 2»).
--
-- До 09.2026 рахунок novapay у леджері був фікцією: при врученні наложки писалось
-- «COD зібрано НоваПей», а реальні зачислення на рахунок і списання з нього в облік
-- не заходили (за обліком 58 тис. при живих 8 тис.). Тепер джерело правди —
-- виписка NovaPay (GetAccountExtract): кожен документ зберігається рівно раз
-- (id = ID документа виписки), вхідні перекази за реєстрами НП проводяться
-- автоматично (DR novapay / CR customer[np:cod]), списання чекають категоризації
-- людиною (витрата / переказ на Mono чи в касу / ігнорувати).

create table if not exists novapay_txns (
  id           text primary key,                 -- ID документа у виписці NovaPay
  account      text,                              -- наш рахунок NovaPay
  txn_date     date not null,
  amount       numeric(14,2) not null check (amount > 0),
  direction    text not null check (direction in ('in', 'out')),
  counterparty text,
  purpose      text,
  code         text,
  register_no  text,                              -- № реєстру НП (виплата наложки)
  kind         text not null default 'other'
               check (kind in ('cod_payout', 'other_in', 'debit')),
  status       text not null default 'unmatched'
               check (status in ('posted', 'unmatched', 'ignored')),
  category     text,                              -- для списань: рахунок витрати або transfer:bank|cash
  txn_id       uuid,                              -- money_entries.txn_id проводки
  note         text,
  raw          jsonb,
  posted_at    timestamptz,
  posted_by    text,
  created_at   timestamptz not null default now()
);

create index if not exists novapay_txns_status_idx on novapay_txns (status);
create index if not exists novapay_txns_date_idx   on novapay_txns (txn_date desc);
create index if not exists novapay_txns_kind_idx   on novapay_txns (kind);
