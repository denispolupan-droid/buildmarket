-- Ручна знижка по замовленню (Варіант A): знижка «зашивається» у построчну ціну
-- items[].price, тому вся облікова гілка (РН, виручка, дебіторка, рахунок, FIFO),
-- яка читає items[].price / total_price, лишається консистентною без змін у ядрі.
-- Ці колонки — лише для індикації (бейдж «−N%») і звітності; сума до сплати
-- завжди дорівнює total_price.
alter table orders add column if not exists discount_pct    numeric not null default 0;
alter table orders add column if not exists discount_amount numeric not null default 0;

comment on column orders.discount_pct    is 'Ручна знижка по замовленню, % (0 = без знижки). Застосована до items[].price.';
comment on column orders.discount_amount is 'Сума знижки в грн (снапшот): Σ(price_base − price)·qty на момент застосування.';
