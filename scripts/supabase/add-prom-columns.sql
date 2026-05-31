-- Migration: add Prom.ua columns to orders table
-- Run once in Supabase SQL editor

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS prom_order_id BIGINT,
  ADD COLUMN IF NOT EXISTS prom_data     JSONB;

-- Unique index so we never import the same Prom order twice
CREATE UNIQUE INDEX IF NOT EXISTS orders_prom_order_id_idx
  ON orders (prom_order_id)
  WHERE prom_order_id IS NOT NULL;

-- Index for fast lookup by channel
CREATE INDEX IF NOT EXISTS orders_channel_code_idx
  ON orders (channel_code)
  WHERE channel_code IS NOT NULL;
