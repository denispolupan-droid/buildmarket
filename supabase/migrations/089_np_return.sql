-- Заявка на повернення у Новій Пошті, створена з журналу замовлень
-- (клієнт не забирає посилку — повертаємо її на наше відділення).
-- np_return_ref    — Ref заявки в НП (для скасування / getReturnOrdersList)
-- np_return_number — номер заявки (104-…), який видно в кабінеті НП
-- np_return_ttn    — номер зворотної ЕН, коли НП її створить
alter table orders add column if not exists np_return_ref        text;
alter table orders add column if not exists np_return_number     text;
alter table orders add column if not exists np_return_ttn        text;
alter table orders add column if not exists np_return_created_at timestamptz;

comment on column orders.np_return_ref is 'Ref заявки на повернення в НП (AdditionalService, OrderType=orderCargoReturn)';
