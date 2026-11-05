-- 157: два нові коди форми оплати в orders.payment_method_code (міграція 099).
--
-- У «other» падали замовлення, яким місце в конкретній групі фільтра журналу:
--   * оплата частинами — Rozetka (payment_type_title «Оплата частинами») і Prom
--     (payment_data.type «rpay_parts», «Оплатить частями»). Раніше одне було
--     'other', два інших — 'invoice', хоча за рахунком ніхто не платить: гроші
--     перераховує площадка/банк, як при Пром-оплаті. → 'installments' (група «Онлайн»)
--   * дропшип — партнер розраховується з нами по взаєморозрахунках, власного
--     способу оплати в замовлення немає. → 'partner' (група «Рахунок»)
-- Після цього група «Готівка» = лише готівка.
--
-- payment_type не змінюється: облік (sale-party, RozetkaPay-рознесення) дивиться
-- на нього, а ця колонка — лише для фільтра й підпису в журналі.
-- PG17: SET EXPRESSION перераховує колонку на місці (774 рядки на 05.11.2026).

alter table public.orders
  alter column payment_method_code set expression as (
    case
      when payment_type = 'cod' then 'cod'
      -- Оплата частинами — раніше за 'invoice'/'other', бо payment_type у них різний
      when prom_data->'payment_data'->>'type' = 'rpay_parts'
        or prom_data->'payment_option'->>'name' ilike '%частям%'
        or prom_data->'payment_option'->>'name' ilike '%частинами%'
        or rozetka_data->'payment'->>'payment_type_title' = 'Оплата частинами' then 'installments'
      when prom_data->'payment_data'->>'type' = 'evopay' then 'prom'
      when rozetka_data->'payment'->>'payment_type_title' in ('Apple Pay', 'Google Pay') then 'wallet'
      when payment_type = 'card'
        or rozetka_data->'payment'->>'payment_type_title' = 'Банківська картка' then 'card'
      -- Дропшип (не накладка): розрахунок із партнером
      when channel_code = 'dropship' then 'partner'
      when payment_type = 'invoice' then 'invoice'
      when payment_type = 'cash' then 'cash'
      when payment_type = 'deferred' then 'deferred'
      else 'other'
    end
  );

comment on column public.orders.payment_method_code is
  'Форма оплати одним кодом (cod / installments / prom / wallet / card / partner / invoice / cash / deferred / other). Рахується з payload площадки + payment_type; див. міграції 099, 157.';
