-- 142: Книга обліку доходів ФОП (єдиний податок, 2 група) — аудит 31.10.2026.
--
-- Дохід ЄП — гроші, що НАДІЙШЛИ (касовий метод), на дату надходження. У леджері
-- це дебет грошового рахунку (cash / bank / acquiring / novapay), друга нога
-- якого — кредит покупця (`customer`, включно зі службовими дебіторами mp:* і
-- np:cod — виплати маркетплейсів і наложки) або партнера-дропшипера (`partner`,
-- поповнення балансу = аванс за товар).
-- НЕ дохід: перекази між власними рахунками (bank ← acquiring, cash ← bank),
-- внесок власника (owner), повернення від постачальника / перевізника,
-- коригування.
--
-- Звірка на проді 31.10.2026 (серпень / вересень / жовтень до 31-го):
-- надходження 203 225 / 239 747 / 154 525 ₴ проти виручки за відвантаженнями
-- 133 660 / 181 778 / 110 242 ₴. Різниця — касовий метод проти нарахування:
-- RozetkaPay платить до вручення, наложка НоваПей приходить пачками реєстрів.
-- Тому source у результаті — щоб бухгалтер бачив склад.

create or replace function public.fop_income_book(p_from date, p_to date)
returns table(day date, method text, source text, amount numeric, txns bigint)
language sql
stable
set search_path = public, pg_temp
as $$
  select d.business_date as day,
         d.account_type  as method,
         case
           when c.account_type = 'partner'          then 'partner'
           when c.counterparty_id = 'np:cod'        then 'cod'
           when c.counterparty_id like 'mp:%'       then 'marketplace'
           else 'customer'
         end as source,
         round(sum(d.amount), 2) as amount,
         count(distinct d.txn_id)::bigint as txns
  from public.money_entries d
  join public.money_entries c
    on c.txn_id = d.txn_id and c.id <> d.id and c.amount < 0
  where d.amount > 0
    and d.account_type in ('cash', 'bank', 'acquiring', 'novapay')
    and c.account_type in ('customer', 'partner')
    and d.business_date between p_from and p_to
  group by 1, 2, 3
  order by 1, 2, 3
$$;

create or replace function public.fop_income_total(p_from date, p_to date)
returns numeric
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(sum(amount), 0) from public.fop_income_book(p_from, p_to)
$$;

grant  execute on function public.fop_income_book(date, date)  to service_role;
grant  execute on function public.fop_income_total(date, date) to service_role;
revoke execute on function public.fop_income_book(date, date)  from public, anon, authenticated;
revoke execute on function public.fop_income_total(date, date) from public, anon, authenticated;
