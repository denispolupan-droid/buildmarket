-- Журнал ручних правок продажу (позиції, ціни, дата).
--
-- Позиції можна міняти з трьох місць — картка замовлення, рахунок на оплату,
-- видаткова-чернетка. Усі три впливають на виручку/COGS/комісію, і без сліду
-- неможливо відповісти, чому надрукований документ відрізняється від того,
-- який бачили вчора. Таблиця тільки на запис і читання службовою роллю.

create table if not exists order_edits (
  id           uuid primary key default gen_random_uuid(),
  at           timestamptz not null default now(),
  order_id     uuid,
  document_id  uuid,
  source       text not null,            -- order-card | invoice | sale-doc
  edited_by    text,
  total_before numeric,
  total_after  numeric,
  date_before  timestamptz,
  date_after   timestamptz,
  items_before jsonb,
  items_after  jsonb,
  issues       jsonb not null default '[]'::jsonb,
  blocked      boolean not null default false
);

create index if not exists order_edits_order_idx on order_edits (order_id, at desc);
create index if not exists order_edits_at_idx    on order_edits (at desc);

alter table order_edits enable row level security;
drop policy if exists internal_only on order_edits;
create policy internal_only on order_edits for all using (false);
