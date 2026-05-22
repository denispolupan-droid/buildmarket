-- ── 1. Таблиця партій (FIFO) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_batches (
  id            UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  sku           TEXT         NOT NULL REFERENCES products(sku) ON DELETE CASCADE,
  warehouse_id  INTEGER      NOT NULL REFERENCES warehouses(id),
  supplier_id   INTEGER      REFERENCES suppliers(id),
  document_id   UUID         REFERENCES acc_documents(id) ON DELETE SET NULL,
  initial_qty   NUMERIC(12,3) NOT NULL CHECK (initial_qty > 0),
  remaining_qty NUMERIC(12,3) NOT NULL CHECK (remaining_qty >= 0),
  cost_price    NUMERIC(12,4) NOT NULL DEFAULT 0,
  received_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_batches_fifo
  ON stock_batches (sku, warehouse_id, received_at)
  WHERE remaining_qty > 0;

CREATE INDEX IF NOT EXISTS idx_batches_document ON stock_batches (document_id);

-- ── 2. Додаємо batch_cost до stock_movements ──────────────────────────────────
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS batch_cost NUMERIC(12,4);

-- ── 3. Функція FIFO-списання ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION consume_stock_fifo(
  p_sku          TEXT,
  p_warehouse_id INTEGER,
  p_qty          NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  v_remaining   NUMERIC := p_qty;
  v_total_cost  NUMERIC := 0;
  v_consume     NUMERIC;
  batch         RECORD;
BEGIN
  FOR batch IN
    SELECT id, remaining_qty, cost_price
    FROM   stock_batches
    WHERE  sku          = p_sku
      AND  warehouse_id = p_warehouse_id
      AND  remaining_qty > 0
    ORDER  BY received_at ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_consume := LEAST(v_remaining, batch.remaining_qty);

    UPDATE stock_batches
    SET    remaining_qty = remaining_qty - v_consume
    WHERE  id = batch.id;

    v_total_cost := v_total_cost + v_consume * batch.cost_price;
    v_remaining  := v_remaining  - v_consume;
  END LOOP;

  RETURN v_total_cost;
END;
$$;

-- ── 4. Функція створення партії при прийомі товару ───────────────────────────
-- FIX: p_supplier_id та p_document_id — nullable (DEFAULT NULL)
CREATE OR REPLACE FUNCTION create_stock_batch(
  p_sku          TEXT,
  p_warehouse_id INTEGER,
  p_qty          NUMERIC,
  p_cost_price   NUMERIC    DEFAULT 0,
  p_received_at  TIMESTAMPTZ DEFAULT NOW(),
  p_supplier_id  INTEGER    DEFAULT NULL,
  p_document_id  UUID       DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO stock_batches (sku, warehouse_id, supplier_id, document_id, initial_qty, remaining_qty, cost_price, received_at)
  VALUES (p_sku, p_warehouse_id, p_supplier_id, p_document_id, p_qty, p_qty, p_cost_price, p_received_at)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ── 5. Очищення тестових даних ────────────────────────────────────────────────
-- TRUNCATE обходить row-level тригери (у т.ч. fn_guard_stock_movements)
-- Порядок: залежні таблиці спочатку, потім батьківські
TRUNCATE TABLE stock_movements    RESTART IDENTITY CASCADE;
TRUNCATE TABLE stock_batches      RESTART IDENTITY CASCADE;
TRUNCATE TABLE stock_reservations RESTART IDENTITY CASCADE;
TRUNCATE TABLE stock_balance      RESTART IDENTITY CASCADE;
TRUNCATE TABLE acc_document_lines RESTART IDENTITY CASCADE;
TRUNCATE TABLE acc_documents      RESTART IDENTITY CASCADE;
