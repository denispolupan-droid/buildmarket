ALTER TABLE price_change_log ADD COLUMN IF NOT EXISTS reverted_at timestamptz;
