-- 123: журнал імпорту реєстрів виплат з пошти (Zoho, папка «Платежі»).
--
-- Реєстри НоваПей (склад виплати наложки по ЕН) і RozetkaPay (реєстр переказів)
-- приходять щодня листами: НоваПей — XLSX-вкладенням, RozetkaPay — посиланням
-- на XLSX. Крон /api/cron/mail-registers читає скриньку, розбирає файли й
-- розносить виплати по замовленнях (lib/mail-registers). Таблиця — щоб один
-- лист не оброблявся двічі і щоб було видно, що з ним сталося.

create table if not exists mail_register_imports (
  message_id   text primary key,                       -- Zoho messageId
  source       text not null check (source in ('novapay', 'rozetkapay')),
  kind         text not null,                          -- np-register | rzpay-register | rzpay-act | other
  register_no  text,
  subject      text,
  received_at  timestamptz,
  status       text not null check (status in ('done', 'skipped', 'no-doc', 'error')),
  result       jsonb,
  error        text,
  processed_at timestamptz not null default now()
);

comment on table mail_register_imports is 'Імпорт реєстрів виплат (НоваПей/RozetkaPay) з пошти: що вже оброблено і з яким результатом';

alter table mail_register_imports enable row level security;
