-- 141: блокування кронів від накладання (аудит 31.10.2026).
--
-- rozetka-orders / prom-orders / epicentr-orders тікають кожні 5 хв, sync-
-- suppliers — раз на 2 год. У синках N+1 по замовленнях і виклики зовнішніх API;
-- довгий тік (повільний Prom/НП) і наступний ішли паралельно: дублі заказів
-- тримає unique-індекс, але транзитні оновлення одного замовлення могли
-- перетирати одне одне. Тепер тік бере короткий лок з TTL; зайнятий лок —
-- тік пропускається (200, без алерту). TTL — щоб упалий процес не тримав лок
-- вічно.

create table if not exists public.cron_locks (
  name       text primary key,
  locked_at  timestamptz not null default now(),
  locked_by  text,
  expires_at timestamptz not null
);
alter table public.cron_locks enable row level security;
-- Політик немає: читає й пише лише service_role.

create or replace function public.try_cron_lock(p_name text, p_ttl_seconds integer, p_by text default null)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_name text;
begin
  insert into public.cron_locks as l (name, locked_at, locked_by, expires_at)
  values (p_name, now(), p_by, now() + make_interval(secs => p_ttl_seconds))
  on conflict (name) do update
    set locked_at = excluded.locked_at,
        locked_by = excluded.locked_by,
        expires_at = excluded.expires_at
    where l.expires_at < now()
  returning l.name into v_name;
  return v_name is not null;
end;
$$;

create or replace function public.release_cron_lock(p_name text)
returns void
language sql
set search_path = public, pg_temp
as $$
  delete from public.cron_locks where name = p_name;
$$;

grant  execute on function public.try_cron_lock(text, integer, text) to service_role;
grant  execute on function public.release_cron_lock(text) to service_role;
revoke execute on function public.try_cron_lock(text, integer, text) from public, anon, authenticated;
revoke execute on function public.release_cron_lock(text) from public, anon, authenticated;
revoke all on table public.cron_locks from anon, authenticated;
