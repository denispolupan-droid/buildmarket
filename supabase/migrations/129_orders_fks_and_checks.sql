-- 129: зовнішні ключі на orders(id) і CHECK на fulfillment_mode.
--
-- Аудит 03.10.2026: acc_documents, money_entries, stock_reservations і
-- order_status_history посилаються на замовлення текстом/uuid без FK — рядок
-- міг пережити своє замовлення або вказувати в нікуди. Перевірено 15.10:
-- сиріт у проді 0 по всіх чотирьох таблицях. Код замовлення не видаляє
-- (жодного .from('orders').delete()), тож RESTRICT нічого не ламає, а лише
-- фіксує: замовлення з документами чи проводками видалити не можна.
-- order_status_history — чистий журнал, іде слідом за замовленням (CASCADE).
--
-- fulfillment_mode у проді: supplier / own / mixed (NULL допустимий —
-- замовлення до підтвердження). delivery_type навмисно НЕ обмежуємо: у даних
-- історично і 'nova', і 'nova_poshta' — спершу уніфікувати, потім CHECK.

ALTER TABLE public.acc_documents
  ADD CONSTRAINT acc_documents_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE public.acc_documents VALIDATE CONSTRAINT acc_documents_order_id_fkey;

ALTER TABLE public.money_entries
  ADD CONSTRAINT money_entries_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE public.money_entries VALIDATE CONSTRAINT money_entries_order_id_fkey;

ALTER TABLE public.stock_reservations
  ADD CONSTRAINT stock_reservations_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE public.stock_reservations VALIDATE CONSTRAINT stock_reservations_order_id_fkey;

ALTER TABLE public.order_status_history
  ADD CONSTRAINT order_status_history_order_id_fkey
  FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE NOT VALID;
ALTER TABLE public.order_status_history VALIDATE CONSTRAINT order_status_history_order_id_fkey;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_fulfillment_mode_check
  CHECK (fulfillment_mode IS NULL OR fulfillment_mode IN ('supplier', 'own', 'mixed'));
