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
      headers := '{"Authorization": "Bearer d942e43e7d4bbfd439a568bc6d34a553d445ce5db3314269b4c041484aee25c7"}'::jsonb,
      body    := '{}'::jsonb
    )
  $$
);
