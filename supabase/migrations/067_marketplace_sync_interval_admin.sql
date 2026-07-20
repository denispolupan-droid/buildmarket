-- Керування інтервалом синку маркетплейсів з адмінки + захист від «злому» крона.
-- Джерело правди — app_settings.marketplace_sync_interval_min. Розклад pg_cron
-- змінюється ТІЛЬКИ через set_marketplace_sync_interval() (жодного ручного SQL),
-- а ensure_marketplace_sync() звіряє факт із джерелом правди і самовідновлює.
--
-- ⚠ ТІЛЬКИ PROD: працює з pg_cron/pg_net, які б'ють у прод-URL. На test не застосовувати.

-- ── Джерело правди: інтервал у хвилинах ────────────────────────────────────
insert into app_settings(key, value) values ('marketplace_sync_interval_min', '15')
  on conflict (key) do nothing;

-- ── Перепланування обох задань під заданий інтервал + запис у app_settings ──
create or replace function public.set_marketplace_sync_interval(p_minutes int)
returns text
language plpgsql
security definer
set search_path = public, cron, net
as $fn$
declare
  v_expr  text;
  v_token text := 'd942e43e7d4bbfd439a568bc6d34a553d445ce5db3314269b4c041484aee25c7';
  v_base  text := 'https://fixline.com.ua/api/cron/';
  v_ch    text;
begin
  if p_minutes not in (5, 10, 15, 30, 60) then
    raise exception 'Недопустимий інтервал %; дозволено 5, 10, 15, 30, 60 хв', p_minutes;
  end if;
  v_expr := case when p_minutes = 60 then '0 * * * *' else '*/' || p_minutes || ' * * * *' end;

  foreach v_ch in array array['rozetka', 'prom'] loop
    -- прибираємо і канонічне, і старе (з міграції 066) ім'я, щоб не було дублів
    perform cron.unschedule(jobid) from cron.job
      where jobname in (v_ch || '-orders-sync', v_ch || '-orders-every-15m');
    perform cron.schedule(
      v_ch || '-orders-sync',
      v_expr,
      format($c$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb)$c$,
             v_base || v_ch || '-orders',
             '{"Authorization": "Bearer ' || v_token || '"}')
    );
  end loop;

  insert into public.app_settings(key, value) values ('marketplace_sync_interval_min', p_minutes::text)
    on conflict (key) do update set value = excluded.value;

  return v_expr;
end;
$fn$;

grant execute on function public.set_marketplace_sync_interval(int) to service_role;

-- ── Реконсиляція + health: звіряє pg_cron з джерелом правди, самовідновлює,
--    повертає стан для алертів (репарація / «не запускалось») ────────────────
create or replace function public.ensure_marketplace_sync()
returns jsonb
language plpgsql
security definer
set search_path = public, cron, net
as $fn$
declare
  v_desired  int;
  v_expr     text;
  v_repaired boolean := false;
  v_jobs     jsonb;
  v_stale    jsonb;
begin
  v_desired := coalesce(nullif((select value from public.app_settings where key = 'marketplace_sync_interval_min'), '')::int, 15);
  if v_desired not in (5, 10, 15, 30, 60) then v_desired := 15; end if;
  v_expr := case when v_desired = 60 then '0 * * * *' else '*/' || v_desired || ' * * * *' end;

  -- дрейф: задання зникло / вимкнене / розклад не збігається → відновлюємо
  if not exists (select 1 from cron.job where jobname = 'rozetka-orders-sync' and active and schedule = v_expr)
     or not exists (select 1 from cron.job where jobname = 'prom-orders-sync' and active and schedule = v_expr) then
    perform public.set_marketplace_sync_interval(v_desired);
    v_repaired := true;
  end if;

  select jsonb_agg(jsonb_build_object('name', jobname, 'schedule', schedule, 'active', active))
    into v_jobs from cron.job where jobname in ('rozetka-orders-sync', 'prom-orders-sync');

  -- «тихий стоп»: задання є, але планувальник не запускав його за 3 інтервали.
  -- Після щойно зробленої репарації не перевіряємо (запусків ще не було).
  if v_repaired then
    v_stale := '[]'::jsonb;
  else
    -- «Тихий стоп» = задання КОЛИСЬ запускалось, але не за останні 3 інтервали.
    -- Свіже задання без історії не рахуємо застарілим (щойно створене — дамо час),
    -- інакше зміна інтервалу давала б хибний алерт до першого запуску.
    select coalesce(jsonb_agg(j.jobname), '[]'::jsonb) into v_stale
    from cron.job j
    where j.jobname in ('rozetka-orders-sync', 'prom-orders-sync')
      and exists (select 1 from cron.job_run_details d where d.jobid = j.jobid)
      and not exists (
        select 1 from cron.job_run_details d
        where d.jobid = j.jobid and d.start_time > now() - make_interval(mins => v_desired * 3)
      );
  end if;

  return jsonb_build_object(
    'repaired', v_repaired, 'desired_min', v_desired, 'expected', v_expr,
    'jobs', coalesce(v_jobs, '[]'::jsonb), 'stale', v_stale
  );
end;
$fn$;

grant execute on function public.ensure_marketplace_sync() to service_role;

-- Канонізуємо задання під поточний інтервал (перейменовує -every-15m → -sync)
select public.set_marketplace_sync_interval(15);
