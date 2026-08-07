-- Чернетки карткових замовлень жили 24 години — рівно стільки, скільки живе
-- інвойс Monobank. Логіка була «інвойс протух — чернетка не потрібна», але вона
-- не врахувала випадок, коли оплата ПРОЙШЛА, а замовлення не створилось: чернетка
-- з усіма даними покупця (ПІБ, телефон, відділення, склад кошика) зникала за добу,
-- і відновити замовлення руками не було з чого. Живий кейс 04.08.2026: клієнт
-- оплатив 104 ₴, замовлення не з'явилось, а до моменту скарги від чернетки не
-- лишилось і сліду.
--
-- Тиждень — щоб у вихідні й у відпустці теж можна було розібратись.
--
-- Обгортка з перевіркою розширення: на test-проєкті pg_cron не встановлено, і без
-- неї міграція там просто падає на «relation cron.job does not exist».
DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cleanup-pending-card-orders';
    PERFORM cron.schedule(
      'cleanup-pending-card-orders',
      '*/30 * * * *',
      $job$
        DELETE FROM pending_card_orders
        WHERE created_at < now() - interval '7 days';
      $job$
    );
  END IF;
END
$mig$;
