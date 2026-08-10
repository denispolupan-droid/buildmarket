-- Знімок стану модерації контенту Rozetka — щоб було з чим порівнювати.
--
-- Кабінет не повідомляє про долю заявок: 709 правок, поданих 2026-08-10, модератор
-- розбирає днями, і кожна кінчається «підтверджено» або «відхилено з причиною».
-- Побачити це можна лише відкривши розділ. Крон-сторож щодоби читає кабінет і
-- порівнює з цією таблицею: без збереженого «вчора» він або мовчав би, або слав
-- те саме повідомлення щодня.
create table if not exists rozetka_moderation_state (
  sku           text primary key,
  change_status text,                       -- «Очікує підтвердження» / «Відхилено» / null
  reasons       text[] not null default '{}',
  checked_at    timestamptz not null default now()
);

comment on table rozetka_moderation_state is
  'Останній побачений стан модерації по кожному товару. Джерело — Rozetka API (/goods/changes + blocked_reason), пише крон rozetka-moderation-watch.';

-- Читає і пише лише службова роль (крон); клієнтам таблиця не потрібна.
alter table rozetka_moderation_state enable row level security;
