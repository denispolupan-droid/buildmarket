-- Синхронізація замовлень маркетплейсів кожні 15 хв через pg_cron (в обхід
-- Vercel cron, який на цьому плані запускається лише раз на добу — через що
-- денні замовлення з'являлися в базі із затримкою до 24 год або тільки після
-- ручного «Синхронізувати»).
--
-- ⚠ ТІЛЬКИ PROD: завдання б'ють у прод-URL fixline.com.ua. На test-БД pg_cron
-- не ввімкнено — цю міграцію на test НЕ застосовуємо (інакше test дублював би
-- синк прода). Синк ідемпотентний (пропускає вже наявні замовлення).

-- Rozetka: кожні 15 хв → /api/cron/rozetka-orders
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'rozetka-orders-every-15m';
SELECT cron.schedule(
  'rozetka-orders-every-15m',
  '*/15 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://fixline.com.ua/api/cron/rozetka-orders',
      headers := '{"Authorization": "Bearer d942e43e7d4bbfd439a568bc6d34a553d445ce5db3314269b4c041484aee25c7"}'::jsonb,
      body    := '{}'::jsonb
    )
  $$
);

-- Prom: кожні 15 хв → /api/cron/prom-orders
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'prom-orders-every-15m';
SELECT cron.schedule(
  'prom-orders-every-15m',
  '*/15 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://fixline.com.ua/api/cron/prom-orders',
      headers := '{"Authorization": "Bearer d942e43e7d4bbfd439a568bc6d34a553d445ce5db3314269b4c041484aee25c7"}'::jsonb,
      body    := '{}'::jsonb
    )
  $$
);
