-- ── Пересчёт avg_cost из реальных остатков по партиям ──────────────────────────
--
-- Проблема: fn_update_stock_balance использовала накопительную среднюю
-- (учитывала все принятые единицы включая проданные).
-- Теперь avg_cost = SUM(cost_price * remaining_qty) / SUM(remaining_qty) по партиям.
-- Это реальная себестоимость того, что физически лежит на складе.

-- ── 1. Вспомогательная функция ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_recalc_avg_cost(
  p_sku          TEXT,
  p_warehouse_id INTEGER
)
RETURNS NUMERIC
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    SUM(cost_price * remaining_qty) / NULLIF(SUM(remaining_qty), 0),
    0
  )
  FROM stock_batches
  WHERE sku          = p_sku
    AND warehouse_id = p_warehouse_id
    AND remaining_qty > 0;
$$;


-- ── 2. Обновлённый триггер на stock_movements ─────────────────────────────────
-- Заменяет накопительную формулу на расчёт из батчей.

CREATE OR REPLACE FUNCTION fn_update_stock_balance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO stock_balance (warehouse_id, sku, qty_total, avg_cost)
  VALUES (
    NEW.warehouse_id,
    NEW.sku,
    NEW.qty,
    fn_recalc_avg_cost(NEW.sku, NEW.warehouse_id)
  )
  ON CONFLICT (warehouse_id, sku) DO UPDATE SET
    qty_total  = stock_balance.qty_total + NEW.qty,
    avg_cost   = fn_recalc_avg_cost(NEW.sku, NEW.warehouse_id),
    updated_at = NOW();

  RETURN NEW;
END;
$$;


-- ── 3. Триггер на stock_batches ────────────────────────────────────────────────
-- Пересчитывает avg_cost при:
-- • FIFO-списании (remaining_qty уменьшается через consume_stock_fifo)
-- • apply_landed_costs (обновляет cost_price в партиях)

CREATE OR REPLACE FUNCTION fn_batch_avg_cost_sync()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE stock_balance
  SET    avg_cost   = fn_recalc_avg_cost(NEW.sku, NEW.warehouse_id),
         updated_at = NOW()
  WHERE  sku          = NEW.sku
    AND  warehouse_id = NEW.warehouse_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_batch_avg_cost_sync ON stock_batches;
CREATE TRIGGER trg_batch_avg_cost_sync
  AFTER UPDATE OF remaining_qty, cost_price ON stock_batches
  FOR EACH ROW EXECUTE FUNCTION fn_batch_avg_cost_sync();


-- ── 4. Разовый пересчёт всех существующих остатков ───────────────────────────

UPDATE stock_balance sb
SET
  avg_cost   = fn_recalc_avg_cost(sb.sku, sb.warehouse_id),
  updated_at = NOW()
WHERE EXISTS (
  SELECT 1 FROM stock_batches
  WHERE sku = sb.sku AND warehouse_id = sb.warehouse_id AND remaining_qty > 0
);
