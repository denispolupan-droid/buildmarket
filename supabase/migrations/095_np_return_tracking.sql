-- Де зараз посилка, що їде назад.
--
-- Стара накладна після відмови одержувача застигає в статусі «Відмова від
-- отримання», а назад посилка їде вже НОВОЮ, створеною «на підставі» (тип
-- CargoReturn). Ми показували в картці повернення статус старої — тобто подію
-- тижневої давнини замість поточного місця. Тут зберігаємо рух саме зворотної.

alter table orders add column if not exists np_return_tracking jsonb;

comment on column orders.np_return_tracking is
  'Де зараз зворотна посилка: {ttn,status,statusCode,place,arrivedAt,storageUntil,syncedAt}. Пише крон sync-delivery-status, джерело — трекінг НП по накладній CargoReturn.';
