-- Rozetka order sync: mirrors the existing prom_order_id/prom_data columns already on orders.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS rozetka_order_id BIGINT,
  ADD COLUMN IF NOT EXISTS rozetka_data     JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS orders_rozetka_order_id_key
  ON orders (rozetka_order_id)
  WHERE rozetka_order_id IS NOT NULL;
