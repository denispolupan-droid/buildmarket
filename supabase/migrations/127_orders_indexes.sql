-- 127: індекси на orders під реальні запити журналу й кронів.
--
-- Аудит 03.10.2026: на orders є індекси лише під вузькі фільтри (customer_id,
-- partner_code, ідентифікатори маркетплейсів), а код фільтрує по status ~80 разів,
-- по created_at (журнал, звіти) і по tracking_number (синк доставки, об'єднані
-- посилки). pg_stat: 15 тис. seq scan / 7,7 млн прочитаних рядків при 566
-- замовленнях — поки дрібниця, але на nano-інстансі IO вже був вичерпаний
-- (21.09.2026), а таблиця росте.
--
-- UNIQUE на order_number: номер генерує тригер fn_generate_order_number через
-- атомарний upsert у order_number_seq, дублів і NULL у проді немає (перевірено
-- 03.10). Індекс закріплює цю властивість і прискорює пошук за номером
-- (журнал, check_invariants, скрипти).

CREATE INDEX IF NOT EXISTS orders_status_created_idx
  ON public.orders (status, created_at DESC);

CREATE INDEX IF NOT EXISTS orders_created_at_idx
  ON public.orders (created_at DESC);

CREATE INDEX IF NOT EXISTS orders_tracking_number_idx
  ON public.orders (tracking_number)
  WHERE tracking_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number_key
  ON public.orders (order_number);
