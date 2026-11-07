-- 158: витрати угоди, рознесені по замовленнях (довідкова розбивка, НЕ проводки).
--
-- Навіщо. Деякі витрати угоди площадка списує однією сумою за день, без номера
-- замовлення: винагорода RozetkaPay за переказ (4 258 ₴ за 20.07–06.11.2026 —
-- 78 % усіх «витрат без замовлення»). У леджері вона лежить на
-- marketplace_fee[rozetkapay] без order_id, і прибуток по замовленню її не бачить.
-- Проводка в money_entries має один order_id на обидві сторони, тож «перекинути»
-- суму на замовлення однією проводкою неможливо, а пари проводок через
-- customer[mp:rozetkapay] змінили б розрахунки по кожному замовленню
-- (взаєморозрахунки, «гроші в дорозі», інваріанти).
--
-- Тому розбивка — окремо: леджер не змінюється, ця таблиця лише каже, ЯКА
-- частина вже проведеної суми припадає на яке замовлення. Пише її тільки
-- lib/deal-costs (з реєстру RozetkaPay: точна комісія по рядку; для ранніх
-- виплат без реєстру — пропорційно сумам замовлень). Читає lib/accounting/estimate
-- (прибуток по замовленню), «Огляд» (решта «без замовлення»), картка замовлення,
-- експорт прибутку. Узгодженість з леджером стереже check-invariants:
-- Σ по (source, source_ref) ≤ проведена сума цієї виплати.
--
-- Дані похідні: будь-яку виплату можна перерахувати заново (replace_order_deal_costs
-- атомарно замінює її розбивку), леджер при цьому не чіпається.

create table if not exists public.order_deal_costs (
  id            bigserial primary key,
  -- Звідки сума: 'rzpay_fee' — винагорода RozetkaPay за переказ. Нові джерела
  -- (Prom-оплата, інший банк) — новим значенням, без нової таблиці.
  source        text        not null check (source in ('rzpay_fee')),
  -- Посилання на проведену суму: для rzpay_fee — id рядка виписки Mono
  -- (той самий, що в ключі проводки rzpay-fee:{id})
  source_ref    text        not null,
  order_id      uuid        not null references public.orders(id) on delete cascade,
  -- Від'ємна — повернення покупцю в цьому переказі за платіж із попереднього:
  -- RozetkaPay повертає й комісію (реєстр 12.10.2026), по замовленню в сумі нуль
  amount        numeric(14,2) not null check (amount <> 0),
  -- Дата проведеної суми (business_date проводки) — за нею «Огляд» віднімає
  -- рознесене з «без замовлення» того самого періоду
  business_date date        not null,
  -- register — точна сума з реєстру; proportional — частка за сумою замовлення
  method        text        not null check (method in ('register', 'proportional')),
  -- Рядки реєстру, з яких складена сума (сума платежу, комісія, id площадки) —
  -- щоб перерахувати без повторного завантаження файлу
  meta          jsonb       not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  unique (source, source_ref, order_id)
);

create index if not exists order_deal_costs_order_idx on public.order_deal_costs (order_id);
create index if not exists order_deal_costs_date_idx  on public.order_deal_costs (business_date);

comment on table public.order_deal_costs is
  'Довідкова розбивка проведених без order_id витрат угоди по замовленнях (міграція 158). Не проводки: леджер не змінює. Пише лише lib/deal-costs.';

alter table public.order_deal_costs enable row level security;
revoke all on public.order_deal_costs from anon, authenticated;
revoke all on sequence public.order_deal_costs_id_seq from anon, authenticated;

-- Атомарна заміна розбивки однієї проведеної суми: старі рядки (source, ref)
-- видаляються, нові вставляються в одній транзакції. p_rows — масив
-- {order_id, amount, meta}. Порожній масив = прибрати розбивку.
create or replace function public.replace_order_deal_costs(
  p_source text, p_ref text, p_business_date date, p_method text, p_rows jsonb
) returns integer
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_count integer;
begin
  delete from order_deal_costs where source = p_source and source_ref = p_ref;
  insert into order_deal_costs (source, source_ref, order_id, amount, business_date, method, meta)
  select p_source, p_ref, (r->>'order_id')::uuid, round((r->>'amount')::numeric, 2), p_business_date, p_method,
         coalesce(r->'meta', '{}'::jsonb)
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
  where round((r->>'amount')::numeric, 2) <> 0;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.replace_order_deal_costs(text, text, date, text, jsonb) from public, anon, authenticated;
grant execute on function public.replace_order_deal_costs(text, text, date, text, jsonb) to service_role;
