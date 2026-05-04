-- Store Nova Poshta settlement and warehouse refs on orders
-- so the manager can create TTN without re-selecting city/warehouse

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_city_ref  text,
  ADD COLUMN IF NOT EXISTS delivery_city_name text,
  ADD COLUMN IF NOT EXISTS delivery_warehouse_ref text;
