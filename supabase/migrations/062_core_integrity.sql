-- Етап 3 аудиту (docs/ACCOUNTING-AUDIT.md): цілісність ядра.
-- 1) consume_stock_fifo: нехватка партій — ПОМИЛКА, а не тихе недосписання COGS.
-- 2) orders.ship_lock: атомарний claim проти подвійної відгрузки (race у /ship).
-- 3) check_invariants: + I7 «delivered без РН», + I8 «РН без виручки» —
--    щоденний крон тепер ловить напівпроведені продажі та пропущені накладні.

-- ── 1. FIFO: RAISE при нехватці партій ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.consume_stock_fifo(p_sku text, p_warehouse_id integer, p_qty numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- Раніше при нехватці партій функція мовчки повертала вартість фактично
  -- списаного — COGS тихо занижувався. Тепер це помилка проведення.
  IF v_remaining > 0.000001 THEN
    RAISE EXCEPTION 'FIFO: недостатньо партій для % на складі %: потрібно %, не вистачає %',
      p_sku, p_warehouse_id, p_qty, v_remaining;
  END IF;

  RETURN v_total_cost;
END;
$function$;

-- ── 2. Анти-double-ship claim ────────────────────────────────────────────────
alter table orders add column if not exists ship_lock timestamptz;
comment on column orders.ship_lock is
  'Атомарний claim відгрузки: /ship захоплює його UPDATE-ом, паралельний запит отримує 409. Протухає за 2 хв.';

-- ── 3. check_invariants: I1–I6 + нові I7, I8 ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_invariants()
 RETURNS TABLE(invariant text, status text, details text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN

  -- I1: stock_balance.qty_total = Σ stock_movements.qty
  RETURN QUERY
  SELECT
    'I1: qty_total = Σ movements'::TEXT,
    CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'FAIL' END::TEXT,
    CASE WHEN COUNT(*) = 0
         THEN 'All stock balances match movement sums'::TEXT
         ELSE string_agg(
           sku || '@wh' || warehouse_id
           || ' balance='   || balance_qty::TEXT
           || ' movements=' || movements_sum::TEXT,
           ', '
         )
    END::TEXT
  FROM (
    SELECT
      b.sku,
      b.warehouse_id,
      b.qty_total                 AS balance_qty,
      COALESCE(SUM(m.qty), 0)     AS movements_sum
    FROM stock_balance b
    LEFT JOIN stock_movements m
      ON m.sku = b.sku AND m.warehouse_id = b.warehouse_id
    GROUP BY b.sku, b.warehouse_id, b.qty_total
    HAVING ABS(b.qty_total - COALESCE(SUM(m.qty), 0)) > 0.001
  ) v;

  -- I2: Σ money_entries per txn_id = 0
  RETURN QUERY
  SELECT
    'I2: ledger balanced (Σ per txn = 0)'::TEXT,
    CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'FAIL' END::TEXT,
    CASE WHEN COUNT(*) = 0
         THEN 'All double-entry transactions are balanced'::TEXT
         ELSE string_agg(txn_id::TEXT || ' sum=' || total::TEXT, ', ')
    END::TEXT
  FROM (
    SELECT txn_id, SUM(amount) AS total
    FROM   money_entries
    GROUP  BY txn_id
    HAVING ABS(SUM(amount)) > 0.001
  ) v;

  -- I3: counterparty_balances = Σ money_entries
  RETURN QUERY
  SELECT
    'I3: balance cache = ledger'::TEXT,
    CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'FAIL' END::TEXT,
    CASE WHEN COUNT(*) = 0
         THEN 'Counterparty balance cache matches ledger'::TEXT
         ELSE string_agg(
           counterparty_id || '/' || account_type
           || ' cache='  || balance::TEXT
           || ' ledger=' || ledger_sum::TEXT,
           ', '
         )
    END::TEXT
  FROM (
    SELECT
      b.counterparty_id,
      b.account_type,
      b.currency,
      b.balance,
      COALESCE(SUM(e.amount), 0) AS ledger_sum
    FROM counterparty_balances b
    LEFT JOIN money_entries e
      ON  e.counterparty_id = b.counterparty_id
      AND e.account_type    = b.account_type
      AND e.currency        = b.currency
    GROUP BY b.counterparty_id, b.account_type, b.currency, b.balance
    HAVING ABS(b.balance - COALESCE(SUM(e.amount), 0)) > 0.001
  ) v;

  -- I4: stock_balance.qty_reserved = Σ active reservations
  RETURN QUERY
  SELECT
    'I4: qty_reserved = Σ active reservations'::TEXT,
    CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'FAIL' END::TEXT,
    CASE WHEN COUNT(*) = 0
         THEN 'Reserved quantities match active reservation rows'::TEXT
         ELSE string_agg(
           sku || '@wh' || warehouse_id
           || ' balance_reserved=' || qty_reserved::TEXT
           || ' reservations='     || res_sum::TEXT,
           ', '
         )
    END::TEXT
  FROM (
    SELECT
      b.sku,
      b.warehouse_id,
      b.qty_reserved,
      COALESCE(SUM(r.qty), 0) AS res_sum
    FROM stock_balance b
    LEFT JOIN stock_reservations r
      ON  r.sku               = b.sku
      AND r.warehouse_id      = b.warehouse_id
      AND r.reservation_status = 'active'
      AND r.released_at IS NULL
    GROUP BY b.sku, b.warehouse_id, b.qty_reserved
    HAVING ABS(b.qty_reserved - COALESCE(SUM(r.qty), 0)) > 0.001
  ) v;

  -- I5: qty_available >= 0 (no oversell)
  RETURN QUERY
  SELECT
    'I5: qty_available >= 0 (no oversell)'::TEXT,
    CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'FAIL' END::TEXT,
    CASE WHEN COUNT(*) = 0
         THEN 'No negative available stock'::TEXT
         ELSE string_agg(
           sku || '@wh' || warehouse_id || ' available=' || qty_available::TEXT,
           ', '
         )
    END::TEXT
  FROM stock_balance
  WHERE qty_available < -0.001;

  -- I6: FIFO batch remaining >= 0
  RETURN QUERY
  SELECT
    'I6: FIFO batch remaining >= 0'::TEXT,
    CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'FAIL' END::TEXT,
    CASE WHEN COUNT(*) = 0
         THEN 'All FIFO batches are non-negative'::TEXT
         ELSE string_agg(
           id::TEXT || ' (' || sku || '@wh' || warehouse_id || ')'
           || ' remaining=' || remaining_qty::TEXT,
           ', '
         )
    END::TEXT
  FROM stock_batches
  WHERE remaining_qty < -0.001;

  -- I7: кожне доставлене замовлення має проведену РН
  RETURN QUERY
  SELECT
    'I7: delivered orders have confirmed sale doc'::TEXT,
    CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'FAIL' END::TEXT,
    CASE WHEN COUNT(*) = 0
         THEN 'Every delivered order has a confirmed sale document'::TEXT
         ELSE string_agg('#' || order_number::TEXT, ', ')
    END::TEXT
  FROM (
    SELECT o.order_number
    FROM orders o
    WHERE o.status = 'delivered'
      AND o.items IS NOT NULL
      AND jsonb_array_length(o.items::jsonb) > 0
      AND NOT EXISTS (
        SELECT 1 FROM acc_documents d
        WHERE d.order_id = o.id AND d.doc_type = 'sale' AND d.status = 'confirmed'
      )
  ) v;

  -- I8: кожна проведена РН має проводку виручки (shipment:{doc_id})
  RETURN QUERY
  SELECT
    'I8: confirmed sale docs have revenue entry'::TEXT,
    CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'FAIL' END::TEXT,
    CASE WHEN COUNT(*) = 0
         THEN 'Every confirmed sale doc has its shipment ledger entry'::TEXT
         ELSE string_agg(doc_number, ', ')
    END::TEXT
  FROM (
    SELECT d.doc_number
    FROM acc_documents d
    WHERE d.doc_type = 'sale'
      AND d.status = 'confirmed'
      AND d.reversal_of IS NULL
      AND COALESCE(d.total_amount, 0) > 0.001
      AND NOT EXISTS (
        SELECT 1 FROM money_entries me
        WHERE me.idempotency_key = 'shipment:' || d.id::TEXT
      )
  ) v;

END;
$function$;
