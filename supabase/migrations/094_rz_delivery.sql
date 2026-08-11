-- «ROZETKA Доставка» як перевізник сайту (rz-delivery.rozetka.ua), delivery_type='rz_delivery'.
--
-- Ідентифікатори точок кладемо у вже наявні delivery_city_ref / delivery_warehouse_ref
-- (там uuid замість Ref Нової Пошти — формат різний, але роль та сама), номер накладної —
-- у tracking_number, текст статусу — в carrier_status_text. Нові колонки потрібні лише під
-- гроші, яких у НП-схемі немає.
--
-- rz_payment_fee — комісія за переказ післяплати. Доставку за нашою домовленістю платить
-- отримувач, а от комісію за переказ грошей Rozetka утримує з ПРОДАВЦЯ, тож це наша
-- витрата, і без окремої колонки вона б розчинилась у різниці балансу.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS rz_delivery_cost  numeric;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rz_payment_fee    numeric;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rz_delivery_payer text;

COMMENT ON COLUMN orders.rz_delivery_cost  IS 'Вартість доставки ROZETKA Доставки (shipping_cost при створенні ЕН), грн';
COMMENT ON COLUMN orders.rz_payment_fee    IS 'Комісія за переказ післяплати (payment_fee), грн — витрата продавця';
COMMENT ON COLUMN orders.rz_delivery_payer IS 'sender | receiver — хто платить доставку';
