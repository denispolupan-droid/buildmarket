-- Додаємо канал дропшипінгу до таблиці sales_channels
INSERT INTO sales_channels (code, name, type, sort_order)
VALUES ('dropship', 'Дропшипінг (партнери)', 'b2b', 35)
ON CONFLICT (code) DO NOTHING;
