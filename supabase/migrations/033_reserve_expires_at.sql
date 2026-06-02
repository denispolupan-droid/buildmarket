-- Додає параметр p_expires_at до reserve_order_items().
-- Дозволяє встановлювати TTL резерву при його створенні.

CREATE OR REPLACE FUNCTION public.reserve_order_items(
  p_order_id     UUID,
  p_warehouse_id INT,
  p_items        JSONB,
  p_expires_at   TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_item      JSONB;
  v_sku       TEXT;
  v_qty       NUMERIC;
  v_avail     NUMERIC;
  v_reserved  JSONB := '[]'::JSONB;
  v_insuff    JSONB := '[]'::JSONB;
BEGIN
  PERFORM 1
  FROM stock_balance
  WHERE warehouse_id = p_warehouse_id
    AND sku IN (
      SELECT item->>'sku'
      FROM jsonb_array_elements(p_items) AS item
    )
  FOR UPDATE;

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
        (order_id, sku, warehouse_id, qty, reservation_status, expires_at)
      VALUES
        (p_order_id, v_sku, p_warehouse_id, v_qty, 'active', p_expires_at);

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
