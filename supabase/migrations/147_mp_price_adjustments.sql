-- 147. Корекції цін маркетплейсів: акції й тимчасові зміни окремо від наценки.
--
-- ЧОМУ
-- Тимчасова переоцінка МП (акція, «до дати») раніше переписувала наценку
-- товару, а в дату повернення крон ставив наценку «до». Якщо за час акції
-- наценку правили ще раз, повернення мовчки затирало цю правку; дві акції, що
-- перетинаються, повертались неправильно; а площадки бачили просто нову ціну —
-- без старої перекресленої.
--
-- МОДЕЛЬ («постійно — наценка, тимчасово — корекція»)
--   * Постійна ціна МП — як і досі, з наценки товару/категорії (products /
--     categories *_markup_pct) через lib/marketplace-pricing.
--   * Корекція — рядок price_adjustments: канал × товар × відсоток, дати дії,
--     позначка «акція». Ціна фіда = формула від наценки × Π(1 + pct/100)
--     активних корекцій, округлення — в кінці. Добуток переставний, тож кожну
--     корекцію можна вимкнути окремо, наценку під час акції — правити вільно.
--   * Акційна корекція: у фід іде і ціна з нею, і стара ціна без неї
--     (Rozetka <price_old>, Prom <price>/<price_promo>) — площадка показує знижку.
--
-- Ціни сайту (product_stock) ця міграція НЕ чіпає.

create table if not exists public.price_adjustments (
  id            bigserial primary key,
  log_id        bigint references public.price_change_log(id) on delete set null,
  channel       text not null check (channel in ('prom', 'rozetka')),
  sku           text not null,
  pct           numeric(12, 6) not null check (pct > -100 and pct < 1000),
  is_promo      boolean not null default false,
  starts_on     date not null,
  ends_on       date,                    -- дата повернення: діє, поки сьогодні (Київ) < ends_on
  cancelled_at  timestamptz,
  -- Стан, який уже відображено в журналі (крон порівнює з датами)
  applied_state text not null default 'pending' check (applied_state in ('pending', 'active', 'ended')),
  comment       text,
  created_by    uuid references auth.users on delete set null,
  created_at    timestamptz not null default now(),
  check (ends_on is null or ends_on > starts_on)
);

create index if not exists price_adjustments_live_idx
  on public.price_adjustments (channel, sku) where cancelled_at is null;
create index if not exists price_adjustments_log_idx
  on public.price_adjustments (log_id);

alter table public.price_adjustments enable row level security;
revoke all on table public.price_adjustments from anon, authenticated;
-- Доступ лише з сервера (service_role): адмінські роути, крони, фіди.

-- Запис журналу, за яким стоять корекції: відкат = вимкнути саме їх
alter table public.price_change_log
  add column if not exists adjustment boolean not null default false;
