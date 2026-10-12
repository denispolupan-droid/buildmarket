-- 128: orders.status — лише значення з lib/orders/status.ts (ORDER_STATUSES).
--
-- Етап 1 плану зростання (12.10.2026): статуси замовлення тепер мають єдине
-- джерело правди в коді (lib/orders/status), а база досі приймала будь-який
-- текст. CHECK закриває це на рівні даних: помилковий або «новий» статус, не
-- доданий у модуль і docs/ORDER-LIFECYCLE.md, впаде тут, а не розповзеться по
-- журналу й кронах. У проді на 12.10 є лише cancelled/delivered/pending_payment/
-- shipped; усі вісім значень — ті, що пише код.

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('new', 'pending_payment', 'confirmed', 'awaiting_stock', 'picking', 'shipped', 'delivered', 'cancelled'));
