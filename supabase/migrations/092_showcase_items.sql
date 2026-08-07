-- Вітрина: товари, які показуються першими на головній магазину і каталогу.
--
-- Чому не прапорець is_hit, який уже є. Він про МАРКУВАННЯ товару (плашка «ХІТ»
-- на картці), а не про вітрину: відмітиш 40 хітів — вітрина стане з 40 позицій,
-- порядок усередині некерований, і один набір доведеться ділити між роздрібом
-- і оптом. Це дві різні задачі, і зшивати їх в одне поле означає потім розплітати.
--
-- surface: 'shop' — роздрібна вітрина, 'catalog' — оптова. Набори різні свідомо:
-- в опті інші пріоритети (обсяги, а не дрібна фасовка).
--
-- sku з зовнішнім ключем на products: прибрали товар із бази — позиція зникає
-- сама, «мертвих» рядків у вітрині не лишається. Товар, який просто закінчився
-- чи деактивований, з бази не зникає — його ховає рендер, а в адмінці він
-- лишається видимим із поміткою.
CREATE TABLE IF NOT EXISTS showcase_items (
  surface   TEXT        NOT NULL CHECK (surface IN ('shop', 'catalog')),
  sku       TEXT        NOT NULL REFERENCES products(sku) ON DELETE CASCADE,
  position  INTEGER     NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (surface, sku)
);

-- Вибірка завжди «всі позиції однієї вітрини по порядку».
CREATE INDEX IF NOT EXISTS showcase_items_surface_position_idx
  ON showcase_items (surface, position);

-- Як і решта службових таблиць адмінки: доступ лише через service role.
-- Вітрину читає серверний компонент, тож анонімний доступ не потрібен.
ALTER TABLE showcase_items ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE showcase_items IS
  'Товари вітрини головної сторінки: surface shop/catalog, порядок — position';
