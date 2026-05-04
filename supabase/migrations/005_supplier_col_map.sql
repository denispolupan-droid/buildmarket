-- Per-supplier column name overrides for CSV/XLS parsing
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS col_sku   text,
  ADD COLUMN IF NOT EXISTS col_price text,
  ADD COLUMN IF NOT EXISTS col_qty   text,
  ADD COLUMN IF NOT EXISTS col_name  text;
