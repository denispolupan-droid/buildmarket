-- promo_codes table already exists from migration 010
-- This migration adds:
-- 1. Atomic increment function (uses existing column `uses_count`)
-- 2. promo_code / promo_discount columns on orders

CREATE OR REPLACE FUNCTION increment_promo_used(p_code TEXT) RETURNS void
LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE promo_codes SET uses_count = uses_count + 1 WHERE code = p_code;
$$;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_code     TEXT    NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_discount NUMERIC NULL;
