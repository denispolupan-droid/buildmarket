-- Історія Search Console + розширення журналу SEO-дій.
--
-- 1) gsc_daily. GSC API тримає 16 місяців, але кожен запит з адмінки бачив лише
--    «останні 28 днів» без порівняння: не можна було відповісти ні «стало краще
--    чи гірше», ні «що дав дожим сторінки». Щоденний зріз по сторінках закриває
--    обидва питання одним механізмом — ефект дії рахується ретроспективно
--    (28 днів до дати дії проти 28 після), без окремих знімків «до/після».
--
--    page_path зберігаємо як шлях БЕЗ домену, але З мовним префіксом
--    (/blog/x і /ru/blog/x — різні рядки): зливати мови можна на читанні,
--    розділити злите назад — уже ні.
--
-- 2) seo_actions: у CHECK не було 'article_new' (створення статті під запит
--    взагалі не логувалося) і не було куди покласти фактичну вартість дії.

create table if not exists public.gsc_daily (
  date        date    not null,
  page_path   text    not null,
  clicks      integer not null default 0,
  impressions integer not null default 0,
  position    numeric(6,2) not null default 0,
  primary key (date, page_path)
);

create index if not exists gsc_daily_page_idx on public.gsc_daily (page_path, date desc);
create index if not exists gsc_daily_date_idx on public.gsc_daily (date desc);

alter table public.gsc_daily enable row level security;
revoke all on public.gsc_daily from anon, authenticated;
grant all on public.gsc_daily to service_role;

alter table public.seo_actions drop constraint if exists seo_actions_action_check;
alter table public.seo_actions add constraint seo_actions_action_check
  check (action in (
    'article_boost',    -- дожим наявної статті під запит
    'article_products', -- блок посилань на товари у статті
    'article_new',      -- нова стаття під запит
    'product_boost',    -- перезапис картки товару під запит
    'cover',            -- обкладинка статті
    'meta_rewrite'      -- переписаний title/description
  ));

-- Скільки реально коштувала дія (раніше в UI показувалась лише груба константа).
alter table public.seo_actions add column if not exists cost_usd numeric(10,4);
