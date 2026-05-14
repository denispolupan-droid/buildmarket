-- Удаляем старую задачу если есть (на случай повторного запуска)
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sync-suppliers-every-2h';

-- Создаём задачу: каждые 2 часа вызывает /api/cron/sync-suppliers
SELECT cron.schedule(
  'sync-suppliers-every-2h',
  '0 */2 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://fixline.com.ua/api/cron/sync-suppliers',
      headers := '{"Authorization": "Bearer d942e43e7d4bbfd439a568bc6d34a553d445ce5db3314269b4c041484aee25c7"}'::jsonb,
      body    := '{}'::jsonb
    )
  $$
);

-- Проверяем что задача создалась
SELECT jobid, schedule, command, active FROM cron.job;
