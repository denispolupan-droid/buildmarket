-- Хто надіслав замовлення постачальнику. Досі зберігався лише час
-- (supplier_sent_at), і в історії замовлення подія «Надіслано постачальнику»
-- була єдиною без автора (18.10.2026). Пишуть роути
-- /api/admin/orders/[id]/supplier-order і /api/admin/supplier-orders/bulk.
-- Для вже надісланих замовлень лишається NULL — автора не відновити.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS supplier_sent_by TEXT;
