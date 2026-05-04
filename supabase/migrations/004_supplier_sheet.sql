-- Allow specifying which Excel sheet to use for sync
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS sheet_name text;
