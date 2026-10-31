-- 139: FIFO під звичайним FOR UPDATE + інваріанти I11/I12 (аудит 31.10.2026).
--
-- 1. consume_stock_fifo брав партії з FOR UPDATE SKIP LOCKED (027/062). Для черги
--    задач це правильно, для FIFO — ні: дві одночасні продажі одного SKU — друга
--    транзакція ПРОПУСКАЄ заблоковану старшу партію й списує молодшу (порушення
--    FIFO в собівартості), а якщо інших партій немає — падає з «недостатньо
--    партій» при фактичному залишку. Звичайний FOR UPDATE чекає на першу
--    транзакцію і бачить її результат. Решта тіла — без змін (062).
--
-- 2. check_invariants: тіло I1–I10 — як у 136 (дослівно), плюс
--    I11: Σ stock_batches.remaining_qty = stock_balance.qty_total по SKU/складу.
--         Саме цього не вистачало, щоб помітити сценарій C1 аудиту: партії
--         списані (consume_stock_fifo закомічений построково), а рухи не
--         вставлені — I1 (баланс = рухи) при цьому зелений.
--    I12: orders.amount_paid = Σ order_payments (не сторнованих) для замовлень,
--         що мають рядки оплат. Замовлення без рядків (передоплата МП, наложка)
--         ведуть amount_paid іншими шляхами — їх інваріант не торкається.
--    На проді 31.10.2026 обидва виконуються (I11: 5 рядків/0 розходжень;
--    I12: 33/0).

-- ── 1. FIFO: FOR UPDATE без SKIP LOCKED ─────────────────────────────────────
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
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_consume := LEAST(v_remaining, batch.remaining_qty);

    UPDATE stock_batches
    SET    remaining_qty = remaining_qty - v_consume
    WHERE  id = batch.id;

    v_total_cost := v_total_cost + v_consume * batch.cost_price;
    v_remaining  := v_remaining  - v_consume;
  END LOOP;

  IF v_remaining > 0.000001 THEN
    RAISE EXCEPTION 'FIFO: недостатньо партій для % на складі %: потрібно %, не вистачає %',
      p_sku, p_warehouse_id, p_qty, v_remaining;
  END IF;

  RETURN v_total_cost;
END;
$function$;

-- ── 2. check_invariants: I1–I10 (136) + I11, I12 ────────────────────────────
CREATE OR REPLACE FUNCTION public.check_invariants()
 RETURNS TABLE(invariant text, status text, details text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN

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


  -- I9: order_lines дзеркалить orders.items — збігаються кількість рядків і сума.
  -- Етап A плану docs/ORDER-LINES-PLAN.md: таблицю заповнює тригер, код її не читає;
  -- розходження означає, що тригер упав (див. WARNING у логах БД) або хтось писав
  -- order_lines повз jsonb.
  RETURN QUERY
  SELECT
    'I9: order_lines mirror orders.items'::TEXT,
    CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'FAIL' END::TEXT,
    CASE WHEN COUNT(*) = 0
         THEN 'Every order has matching order_lines (count and amount)'::TEXT
         ELSE string_agg('#' || order_number::TEXT, ', ')
    END::TEXT
  FROM (
    SELECT o.order_number
    FROM orders o
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS n, COALESCE(SUM(l.amount), 0) AS amt
      FROM order_lines l WHERE l.order_id = o.id
    ) l ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS n,
             COALESCE(SUM(COALESCE(NULLIF(i->>'qty', '')::numeric, 0)
                        * COALESCE(NULLIF(i->>'price', '')::numeric, 0)), 0) AS amt
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(o.items) = 'array' THEN o.items ELSE '[]'::jsonb END
      ) i
      WHERE jsonb_typeof(i) = 'object'
    ) j ON TRUE
    WHERE l.n <> j.n OR ABS(l.amt - j.amt) > 0.005
  ) v;

  -- I10: orders.total_price = Σ order_lines.amount (правило «сума лише з рядків»,
  -- AGENTS.md «Гроші»). На 31.10.2026 виконується для всіх 746 замовлень у проді.
  RETURN QUERY
  SELECT
    'I10: orders.total_price = Σ order_lines.amount'::TEXT,
    CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'FAIL' END::TEXT,
    CASE WHEN COUNT(*) = 0
         THEN 'Every order total equals the sum of its lines'::TEXT
         ELSE string_agg('#' || order_number::TEXT || ' total=' || total_price::TEXT || ' lines=' || amt::TEXT, ', ')
    END::TEXT
  FROM (
    SELECT o.order_number, o.total_price, COALESCE(SUM(l.amount), 0) AS amt
    FROM orders o
    LEFT JOIN order_lines l ON l.order_id = o.id
    GROUP BY o.id, o.order_number, o.total_price
    HAVING ABS(COALESCE(o.total_price, 0) - COALESCE(SUM(l.amount), 0)) > 0.01
  ) v;


  -- I11: Σ stock_batches.remaining_qty = stock_balance.qty_total (по SKU/складу).
  -- Дропшип-рядки рухів не створюють і партій не мають — у stock_balance їх теж
  -- немає, тож порівняння коректне для всіх складів.
  RETURN QUERY
  SELECT
    'I11: Σ batches.remaining = stock_balance.qty_total'::TEXT,
    CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'FAIL' END::TEXT,
    CASE WHEN COUNT(*) = 0
         THEN 'Batch remainders match stock balances'::TEXT
         ELSE string_agg(sku || '@wh' || warehouse_id || ' balance=' || qty_total::TEXT || ' batches=' || rem::TEXT, ', ')
    END::TEXT
  FROM (
    SELECT sb.sku, sb.warehouse_id, sb.qty_total, COALESCE(b.rem, 0) AS rem
    FROM stock_balance sb
    LEFT JOIN LATERAL (
      SELECT SUM(x.remaining_qty) AS rem
      FROM stock_batches x
      WHERE x.sku = sb.sku AND x.warehouse_id = sb.warehouse_id
    ) b ON TRUE
    WHERE ABS(COALESCE(b.rem, 0) - sb.qty_total) > 0.001
  ) v;

  -- I12: orders.amount_paid = Σ order_payments.amount (reversed = false) —
  -- для замовлень, що мають хоч один рядок оплати.
  RETURN QUERY
  SELECT
    'I12: orders.amount_paid = Σ order_payments'::TEXT,
    CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'FAIL' END::TEXT,
    CASE WHEN COUNT(*) = 0
         THEN 'amount_paid matches order_payments for every order with payments'::TEXT
         ELSE string_agg('#' || order_number::TEXT || ' amount_paid=' || amount_paid::TEXT || ' payments=' || paid::TEXT, ', ')
    END::TEXT
  FROM (
    SELECT o.order_number, COALESCE(o.amount_paid, 0) AS amount_paid, p.paid
    FROM orders o
    JOIN LATERAL (
      SELECT COALESCE(SUM(x.amount) FILTER (WHERE NOT COALESCE(x.reversed, false)), 0) AS paid,
             COUNT(*) AS n
      FROM order_payments x WHERE x.order_id = o.id
    ) p ON TRUE
    WHERE p.n > 0 AND ABS(COALESCE(o.amount_paid, 0) - p.paid) > 0.01
  ) v;

END;
$function$;
