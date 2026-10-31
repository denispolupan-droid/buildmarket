-- 138: прибрати залишки pg_cron-синку маркетплейсів і секрет крона з DDL.
--
-- З 26.07.2026 HTTP-крони живуть у vercel.json; у pg_cron лишились тільки
-- SQL-задання (expire-stock-reservations, cleanup-*). Але функції
-- ensure_marketplace_sync() і set_marketplace_sync_interval() з міграцій
-- 066/067 досі існували на проді й зберігали в тілі CRON_SECRET відкритим
-- текстом (аудит 31.10.2026); один виклик будь-якої з них пересоздав би
-- pg_cron-дублі синків поряд із Vercel-кронами. Секрет ротовано тією ж датою,
-- роут /api/cron/ensure-marketplace-sync і вкладку «Маркетплейси» в
-- налаштуваннях видалено разом із цією міграцією.
--
-- На test цих функцій не було (066/067 — «ТОЛЬКО PROD»), тому все через IF EXISTS.

drop function if exists public.ensure_marketplace_sync();
drop function if exists public.set_marketplace_sync_interval(integer);
delete from public.app_settings where key = 'marketplace_sync_interval_min';

-- Якщо раптом pg_cron-дублі ще є — зняти (назви з 066).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
      from cron.job
     where jobname in ('rozetka-orders-every-15m', 'prom-orders-every-15m',
                       'mono-statement-reconcile', 'sync-suppliers-every-2h');
  end if;
end $$;
