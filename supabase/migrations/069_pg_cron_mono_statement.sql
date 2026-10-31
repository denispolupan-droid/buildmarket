-- Крон-реконсиляція виписки ФОП Monobank кожні 30 хв (страховка на пропущений
-- вебхук). net.http_post → прод-ендпоінт, ідемпотентно (дедуп по id транзакції).
--
-- ⚠ ТІЛЬКИ PROD: б'є в прод-URL, на test pg_cron немає. Метод POST (роут має POST=GET).

select cron.unschedule(jobid) from cron.job where jobname = 'mono-statement-reconcile';
select cron.schedule(
  'mono-statement-reconcile',
  '*/30 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://fixline.com.ua/api/cron/mono-statement',
      headers := '{"Authorization": "Bearer <CRON_SECRET-rotated-2026-10-31>"}'::jsonb,
      body    := '{}'::jsonb
    )
  $$
);
