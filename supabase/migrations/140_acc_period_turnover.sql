-- 140: обороти леджера по місяцях — агрегат у базі для екрана «Періоди».
--
-- /api/admin/finance/periods читав money_entries цілком без меж і рахував
-- обороти в JS; PostgREST мовчки віддає лише 1000 рядків, тож цифри були
-- неправильні, щойно леджер переріс тисячу проводок (аудит 31.10.2026).
-- Функція — SECURITY INVOKER (RLS leджера лишається в силі), виконання
-- лише для service_role.

create or replace function public.acc_period_turnover()
returns table(month date, txns bigint, revenue numeric)
language sql
stable
set search_path = public, pg_temp
as $$
  select date_trunc('month', business_date)::date as month,
         count(*)::bigint as txns,
         round(coalesce(-sum(amount) filter (where account_type = 'revenue'), 0), 2) as revenue
  from public.money_entries
  group by 1
  order by 1
$$;

grant  execute on function public.acc_period_turnover() to service_role;
revoke execute on function public.acc_period_turnover() from public, anon, authenticated;
