-- ============================================================================
-- 072  expire_stock_reservations — істікати резерв ЛИШЕ до відгрузки
-- ============================================================================
-- Варіант 3: продаж проводиться при доставці, тому резерв тримається через весь
-- транзит (shipped → delivered). Стара версія функції істікала будь-який активний
-- резерв за expires_at (виставляється +7дн при підтвердженні) БЕЗ перевірки статусу
-- замовлення — тобто могла звільнити резерв посилки, що вже в дорозі → oversell.
-- Тепер істікаємо тільки покинуті резерви замовлень ДО відгрузки.
-- (Функція наразі не запланована в cron — ризик латентний, але підстраховуємось до
--  того, як її колись увімкнуть.)
-- ============================================================================
CREATE OR REPLACE FUNCTION expire_stock_reservations()
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  v_count INT;
BEGIN
  WITH expired AS (
    UPDATE stock_reservations sr
    SET released_at        = NOW(),
        reservation_status = 'expired',
        release_reason     = 'expired'
    FROM orders o
    WHERE sr.order_id = o.id
      AND sr.reservation_status = 'active'
      AND sr.expires_at IS NOT NULL
      AND sr.expires_at < NOW()
      AND o.status IN ('new', 'confirmed', 'awaiting_stock', 'picking')  -- НЕ чіпаємо shipped/delivered
    RETURNING sr.warehouse_id
  )
  SELECT COUNT(*) INTO v_count FROM expired;
  RETURN v_count;
END;
$$;
