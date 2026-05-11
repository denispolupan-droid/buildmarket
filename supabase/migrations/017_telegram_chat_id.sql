ALTER TABLE orders ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;
CREATE INDEX IF NOT EXISTS idx_orders_telegram ON orders(telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;
