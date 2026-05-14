-- Режим виконання замовлення: supplier (дропшип), own (наш склад), mixed (обидва)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment_mode TEXT DEFAULT 'supplier';

-- Email постачальника для відправки замовлень
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS email TEXT;
