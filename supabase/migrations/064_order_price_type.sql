-- Тип цін замовлення (роздріб / опт / дроп): відображається і змінюється
-- в картці замовлення адмінки; зміна перераховує позиції за відповідним прайсом.
alter table orders add column if not exists price_type text
  check (price_type in ('retail', 'wholesale', 'drop'));

comment on column orders.price_type is
  'Тариф, за яким пораховані позиції замовлення: retail | wholesale | drop';

-- Бекфіл існуючих: дроп-канал → drop; клієнт-оптовик → wholesale; інакше retail
update orders o set price_type = case
  when o.channel_code = 'dropship' then 'drop'
  when exists (select 1 from customers c where c.id = o.customer_id and c.type = 'wholesale') then 'wholesale'
  else 'retail'
end
where o.price_type is null;
