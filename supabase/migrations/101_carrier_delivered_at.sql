-- Коли перевізник видав посилку.
--
-- До цього в замовленні була тільки orders.delivered_at — момент, коли крон
-- ПОБАЧИВ доставку, а не коли покупець забрав. Між ними лежить інтервал крона,
-- і на нічних видачах різниця виходила в години. Для розбору «коли саме
-- отримали» потрібен час самого перевізника.
--
-- Заповнює lib/delivery-sync.ts з полів НП ActualDeliveryDate / RecipientDateTime
-- (київський час без зони — конвертується в UTC у lib/np-datetime.ts).
-- Для Rozetka лишається null: їхнє API часу видачі не віддає, там показуємо
-- наш delivered_at із поміткою, що це наші дані.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS carrier_delivered_at TIMESTAMPTZ;

COMMENT ON COLUMN orders.carrier_delivered_at IS
  'Час видачі посилки за даними перевізника (НП). NULL — перевізник часу не дав.';
