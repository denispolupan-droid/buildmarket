-- Гарантируем наличие дефолтного физического склада.
-- recordDropshipSale требует warehouses.is_default=true для создания документа продажи.
INSERT INTO warehouses (slug, name, warehouse_type, is_default, is_active)
VALUES ('main', 'Основний склад', 'physical', true, true)
ON CONFLICT (slug) DO NOTHING;
