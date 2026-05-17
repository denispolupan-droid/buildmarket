-- ============================================================
-- Атомарне резервування товарів зі складу
-- ============================================================
--
-- Проблема старого підходу (createReservation в TypeScript):
--   1. SELECT qty_available FROM stock_balance   ← читаємо доступну кількість
--   2. if (available >= qty) ...                 ← перевіряємо в коді
--   3. INSERT INTO stock_reservations            ← резервуємо
--
--   Між кроками 1 і 3 інший запит може зарезервувати той самий товар.
--   Обидва бачать available=10, обидва резервують 10 → qty_reserved=20, qty_total=10.
--   Constraint chk_reserved_lte_total (migration 028) ловить це як DB error,
--   але це вже пізно — одне замовлення отримає 500, стан непослідовний.
--
-- Рішення:
--   SELECT ... FOR UPDATE на stock_balance блокує рядки.
--   Другий паралельний виклик чекає поки перший завершиться.
--   Перевірка і INSERT відбуваються в одній транзакції, розриву немає.
--
-- Повертає JSONB:
--   { success: bool, reserved: [{sku, qty}], insufficient: [{sku, requested, available}] }
-- ============================================================

CREATE OR REPLACE FUNCTION reserve_order_items(
  p_order_id     UUID,
  p_warehouse_id INT,
  p_items        JSONB   -- [{sku: text, qty: numeric}]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item      JSONB;
  v_sku       TEXT;
  v_qty       NUMERIC;
  v_avail     NUMERIC;
  v_reserved  JSONB := '[]'::JSONB;
  v_insuff    JSONB := '[]'::JSONB;
BEGIN
  -- Блокуємо всі рядки balance для цих SKU в цьому складі.
  -- Якщо рядка ще немає — skip (товар відсутній → available=0 нижче).
  PERFORM 1
  FROM stock_balance
  WHERE warehouse_id = p_warehouse_id
    AND sku IN (
      SELECT item->>'sku'
      FROM jsonb_array_elements(p_items) AS item
    )
  FOR UPDATE;

  -- Для кожного товару перевіряємо і резервуємо
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_sku := v_item->>'sku';
    v_qty := (v_item->>'qty')::NUMERIC;

    SELECT COALESCE(qty_available, 0)
    INTO   v_avail
    FROM   stock_balance
    WHERE  warehouse_id = p_warehouse_id
      AND  sku = v_sku;

    IF COALESCE(v_avail, 0) >= v_qty THEN
      INSERT INTO stock_reservations
        (order_id, sku, warehouse_id, qty, reservation_status)
      VALUES
        (p_order_id, v_sku, p_warehouse_id, v_qty, 'active');

      v_reserved := v_reserved || jsonb_build_array(
        jsonb_build_object('sku', v_sku, 'qty', v_qty)
      );
    ELSE
      v_insuff := v_insuff || jsonb_build_array(
        jsonb_build_object(
          'sku',       v_sku,
          'requested', v_qty,
          'available', COALESCE(v_avail, 0)
        )
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success',      jsonb_array_length(v_insuff) = 0,
    'reserved',     v_reserved,
    'insufficient', v_insuff
  );
END;
$$;


-- ============================================================
-- Атомарне зняття резерву по замовленню
-- ============================================================
-- Те саме що releaseReservation в TypeScript, але на рівні БД.
-- Тригер trg_stock_reserved_update вже знімає qty_reserved при
-- UPDATE released_at NULL→NOT NULL.
-- ============================================================

CREATE OR REPLACE FUNCTION release_order_reservations(
  p_order_id UUID,
  p_reason   TEXT DEFAULT 'manual'  -- 'shipped' | 'cancelled' | 'manual'
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE stock_reservations
  SET    released_at        = NOW(),
         reservation_status = 'released',
         release_reason     = p_reason
  WHERE  order_id    = p_order_id
    AND  released_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
