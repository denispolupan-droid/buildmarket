-- 145: звіти леджера агрегуються в базі, а не в JS (аудит 31.10.2026).
--
-- ОСВ (/admin/finance/trial-balance) читала ВЕСЬ леджер від початку часів
-- сторінками по 1000 і складала в JS: при 100 тис. проводок — десятки запитів
-- і секунди на відкриття. Тепер одна функція віддає вже згорнуті рядки
-- «рахунок × контрагент». Семантика — дослівно та, що була в коді: вхідне
-- сальдо — Σ до p_from; обороти — окремо Σ додатних (Дт) і Σ від'ємних (Кт)
-- проводок у [p_from, p_to].

create or replace function public.acc_trial_balance(p_from date, p_to date)
returns table(account_type text, counterparty_id text, opening numeric, debit numeric, credit numeric)
language sql
stable
set search_path = public, pg_temp
as $$
  select m.account_type,
         coalesce(m.counterparty_id, '') as counterparty_id,
         coalesce(sum(m.amount) filter (where m.business_date < p_from), 0)                    as opening,
         coalesce(sum(m.amount) filter (where m.business_date >= p_from and m.amount >= 0), 0) as debit,
         coalesce(-sum(m.amount) filter (where m.business_date >= p_from and m.amount < 0), 0) as credit
    from public.money_entries m
   where m.business_date <= p_to
   group by 1, 2
$$;

grant  execute on function public.acc_trial_balance(date, date) to service_role;
revoke execute on function public.acc_trial_balance(date, date) from public, anon, authenticated;

-- Залишки рахунків за весь час («Огляд»: гроші на bank/acquiring/novapay/cash).
-- Кеш counterparty_balances грошових рахунків не містить (контрагента в них
-- немає), тож раніше «Огляд» читав усі їхні проводки сторінками.
create or replace function public.acc_account_totals(p_accounts text[])
returns table(account_type text, amount numeric)
language sql
stable
set search_path = public, pg_temp
as $$
  select m.account_type, coalesce(sum(m.amount), 0)
    from public.money_entries m
   where m.account_type = any(p_accounts)
   group by 1
$$;

grant  execute on function public.acc_account_totals(text[]) to service_role;
revoke execute on function public.acc_account_totals(text[]) from public, anon, authenticated;
