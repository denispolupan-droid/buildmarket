-- ══════════════════════════════════════════════════════════════════════════════
-- 030: Перевірка інваріантів системи обліку
--
-- check_invariants() повертає рядки (invariant, status, details).
-- status = 'OK' або 'FAIL'. Виклик: SELECT * FROM check_invariants();
--
-- Інваріанти:
--   I1 — stock_balance.qty_total     = Σ stock_movements.qty
--   I2 — Σ money_entries per txn_id  = 0  (подвійний запис збалансований)
--   I3 — counterparty_balances        = Σ money_entries по контрагенту
--   I4 — stock_balance.qty_reserved  = Σ активних stock_reservations
--   I5 — stock_balance.qty_available >= 0  (немає продажів понад залишок)
--   I6 — stock_batches.remaining_qty >= 0  (FIFO не пішов у мінус)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION check_invariants()
RETURNS TABLE(
  invariant TEXT,
  status    TEXT,
  details   TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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

END;
$$;
