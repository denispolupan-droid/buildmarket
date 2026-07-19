-- Етап 4 аудиту: закриття облікових періодів (аналог «дати заборони редагування» в 1С).
-- Закритий місяць = заборона будь-яких грошових проводок із business_date у ньому.
-- Закрити місяць можна лише коли всі інваріанти OK; відкрити назад може тільки адмін.

create table if not exists acc_periods (
  period    date primary key,        -- перший день місяця
  closed_at timestamptz,
  closed_by text
);

alter table acc_periods enable row level security;
drop policy if exists internal_only on acc_periods;
create policy internal_only on acc_periods for all using (false);

-- Заборона проводок у закритий період
create or replace function public.assert_period_open(p_date date)
returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if exists (
    select 1 from acc_periods
    where period = date_trunc('month', p_date)::date
      and closed_at is not null
  ) then
    raise exception 'Період % закрито — проводки з цією датою заборонені', to_char(p_date, 'YYYY-MM');
  end if;
end;
$$;

create or replace function public.fn_guard_closed_period()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  perform assert_period_open(new.business_date);
  return new;
end;
$$;

drop trigger if exists trg_money_entries_period_guard on money_entries;
create trigger trg_money_entries_period_guard
  before insert on money_entries
  for each row execute function fn_guard_closed_period();

-- Закриття/відкриття місяця. SECURITY DEFINER, виклик тільки через service role
-- (EXECUTE в anon/authenticated відкликається нижче — політика 052).
create or replace function public.close_period(p_month date, p_by text default null)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_period date := date_trunc('month', p_month)::date;
  v_fails  int;
begin
  if v_period >= date_trunc('month', current_date)::date then
    raise exception 'Не можна закрити поточний або майбутній місяць';
  end if;

  select count(*) into v_fails from check_invariants() where status = 'FAIL';
  if v_fails > 0 then
    raise exception 'Інваріанти обліку FAIL (%) — спочатку виправте розбіжності', v_fails;
  end if;

  insert into acc_periods (period, closed_at, closed_by)
  values (v_period, now(), p_by)
  on conflict (period) do update set closed_at = now(), closed_by = excluded.closed_by;

  return 'closed:' || to_char(v_period, 'YYYY-MM');
end;
$$;

create or replace function public.open_period(p_month date, p_by text default null)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_period date := date_trunc('month', p_month)::date;
begin
  update acc_periods set closed_at = null, closed_by = p_by where period = v_period;
  return 'opened:' || to_char(v_period, 'YYYY-MM');
end;
$$;

revoke execute on function public.close_period(date, text) from anon, authenticated;
revoke execute on function public.open_period(date, text)  from anon, authenticated;
revoke execute on function public.assert_period_open(date) from anon, authenticated;
