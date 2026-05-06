ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_confirmed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS callback_done     boolean DEFAULT false;
