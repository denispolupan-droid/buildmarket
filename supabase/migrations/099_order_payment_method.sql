-- Форма оплати замовлення одним кодом.
--
-- Фільтр у журналі замовлень мав розрізняти «рахунок / накладений / Пром-оплата
-- / картка», а цього немає в жодній окремій колонці: orders.payment_type знає
-- лише грубий тип, а справжній спосіб лежить у payload маркетплейсу. Гірше —
-- вони розходяться: 3 замовлення Prom мають payment_type='invoice' при
-- фактичній Пром-оплаті, 2 замовлення Rozetka — 'invoice' при Apple Pay.
--
-- Рахувати це в застосунку означало б тримати дві реалізації (SQL для фільтра
-- списку з пагінацією + JS для лічильників чіпів) і стежити, щоб вони не
-- розʼїхались. Тому класифікація живе в БД як generated-колонка: фільтр і
-- лічильники беруть одне й те саме значення, і воно ж індексується.
--
-- Порядок гілок важливий: спершу дивимось на payload площадки, і лише потім на
-- payment_type — саме через розбіжності вище.

alter table public.orders
  add column if not exists payment_method_code text
  generated always as (
    case
      -- Накладений платіж однаково розмічений усіма каналами
      when payment_type = 'cod' then 'cod'
      -- Пром-оплата (evopay) — навіть якщо payment_type каже 'invoice'
      when prom_data->'payment_data'->>'type' = 'evopay' then 'prom'
      -- Гаманці Rozetka
      when rozetka_data->'payment'->>'payment_type_title' in ('Apple Pay', 'Google Pay') then 'wallet'
      -- Картка: онлайн-оплата сайту (Monobank) і банківська картка Rozetka
      when payment_type = 'card'
        or rozetka_data->'payment'->>'payment_type_title' = 'Банківська картка' then 'card'
      -- Безготівка: рахунок сайту/роздробу і «Оплата на рахунок продавця» Rozetka
      when payment_type = 'invoice' then 'invoice'
      when payment_type = 'cash' then 'cash'
      when payment_type = 'deferred' then 'deferred'
      else 'other'
    end
  ) stored;

comment on column public.orders.payment_method_code is
  'Форма оплати одним кодом (cod / prom / wallet / card / invoice / cash / deferred / other). Рахується з payload площадки + payment_type; див. міграцію 099.';

-- Фільтр у журналі завжди йде разом зі статусом і датою
create index if not exists orders_payment_method_idx
  on public.orders (payment_method_code, status, created_at desc);
