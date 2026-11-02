-- 148: Книга доходів ФОП — сторно й повернення зменшують дохід.
--
-- 142 брала лише дебети грошових рахунків (d.amount > 0) у парі з кредитом покупця.
-- Сторно виплати (дебет покупця, кредит грошового рахунку) не віднімалось, тож
-- перепроведені виплати рахувались двічі: III кв. 2026 НоваПей 285 936 ₴ проти
-- 101 133 ₴ у виписці (наложку спершу проводили cod-collect, потім за реєстрами
-- np-payout зі сторно попередніх). Тепер беремо грошову ногу з будь-яким знаком у
-- парі з протилежною ногою покупця/партнера: сторно і повернення покупцю (п. 292.6
-- ПКУ — зменшують дохід періоду повернення) ідуть мінусом.
-- Звірка на проді 02.11.2026, III кв.: novapay 101 133,01 (виписка 101 132,55, різниця —
-- округлення), bank 179 247,90 = РозеткаПей 173 402,90 + прямі оплати 5 845,00.
-- Пару шукаємо lateral … limit 1: багатоногий txn (напр. з rounding) не множить суму.

create or replace function public.fop_income_book(p_from date, p_to date)
returns table(day date, method text, source text, amount numeric, txns bigint)
language sql
stable
set search_path = public, pg_temp
as $$
  select d.business_date as day,
         d.account_type  as method,
         src.source,
         round(sum(d.amount), 2) as amount,
         count(distinct d.txn_id) filter (where d.amount > 0)::bigint as txns
  from public.money_entries d
  cross join lateral (
    select case
             when c.account_type = 'partner'   then 'partner'
             when c.counterparty_id = 'np:cod' then 'cod'
             when c.counterparty_id like 'mp:%' then 'marketplace'
             else 'customer'
           end as source
    from public.money_entries c
    where c.txn_id = d.txn_id
      and c.id <> d.id
      and c.account_type in ('customer', 'partner')
      and sign(c.amount) = -sign(d.amount)
    order by abs(c.amount) desc, c.id
    limit 1
  ) src
  where d.amount <> 0
    and d.account_type in ('cash', 'bank', 'acquiring', 'novapay')
    and d.business_date between p_from and p_to
  group by 1, 2, 3
  order by 1, 2, 3
$$;

grant  execute on function public.fop_income_book(date, date) to service_role;
revoke execute on function public.fop_income_book(date, date) from public, anon, authenticated;
