-- 136_order_lines.sql — етап A плану docs/ORDER-LINES-PLAN.md (31.10.2026)
--
-- Рядки замовлення як таблиця. На цьому етапі таблиця — ДЗЕРКАЛО orders.items (jsonb):
-- її заповнює тригер, жоден читач і писар у коді не змінюється, тому ризик для
-- прода нульовий, відкат — DROP TABLE + DROP TRIGGER + повернути check_invariants.
--
-- Рішення власника 31.10.2026: рядок без товару ДОЗВОЛЕНИЙ. Тому зв'язок із
-- каталогом — через product_id (NULL, якщо артикула в products немає або товар
-- видалили: ON DELETE SET NULL), а sku/name/brand/price лишаються знімком на момент
-- замовлення. Строгий FK по sku, як у першій версії плану, не вмикаємо.
--
-- Чому тригер SECURITY DEFINER: замовлення з сайту вставляє роль anon (політика
-- «Allow guest order inserts»), а order_lines під RLS без політик. Без DEFINER
-- дзеркало для гостьових замовлень мовчки не записувалось би. EXECUTE для
-- anon/authenticated відкликано, тож через REST функції не викликати
-- (сторож /api/cron/secdef-guard).
--
-- Чому тригер не кидає помилок: дзеркало не має права зламати створення
-- замовлення. Будь-який збій → RAISE WARNING у лог БД, а розходження ловить I9.

-- ── 1. Таблиця ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_lines (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id    uuid    NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sort_order  integer NOT NULL,                       -- позиція в items[] (з 1)
  sku         text    NOT NULL,                       -- знімок артикула
  product_id  integer REFERENCES public.products(id) ON DELETE SET NULL,
  name        text    NOT NULL DEFAULT '',            -- знімок назви
  brand       text    NOT NULL DEFAULT '',
  qty         numeric NOT NULL,
  price       numeric NOT NULL,                       -- ціна за одиницю (уже зі знижкою, див. project_order_discount)
  price_base  numeric,                                -- ціна до ручної знижки
  is_promo    boolean NOT NULL DEFAULT false,
  is_bonus    boolean NOT NULL DEFAULT false,
  amount      numeric GENERATED ALWAYS AS (qty * price) STORED,
  meta        jsonb   NOT NULL DEFAULT '{}'::jsonb,   -- решта ключів jsonb (cost_price, volume, imageUrl, ac/bc/nl1 …)
  UNIQUE (order_id, sort_order)
);

COMMENT ON TABLE  public.order_lines IS 'Рядки замовлення. Етап A: дзеркало orders.items тригером trg_order_lines_mirror; код читає/пише ще jsonb (docs/ORDER-LINES-PLAN.md).';
COMMENT ON COLUMN public.order_lines.product_id IS 'Товар із каталогу або NULL — вільний рядок чи видалений товар (рішення власника 31.10.2026).';

CREATE INDEX IF NOT EXISTS order_lines_sku_idx     ON public.order_lines (sku);
CREATE INDEX IF NOT EXISTS order_lines_product_idx ON public.order_lines (product_id) WHERE product_id IS NOT NULL;

ALTER TABLE public.order_lines ENABLE ROW LEVEL SECURITY;  -- політик немає: лише service role

-- ── 2. Синхронізація одного замовлення ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_order_lines_sync(p_order_id uuid, p_items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  DELETE FROM order_lines WHERE order_id = p_order_id;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RETURN;
  END IF;
  INSERT INTO order_lines
    (order_id, sort_order, sku, product_id, name, brand, qty, price, price_base, is_promo, is_bonus, meta)
  SELECT
    p_order_id,
    e.n::integer,
    COALESCE(e.i->>'sku', ''),
    p.id,
    COALESCE(e.i->>'name', ''),
    COALESCE(e.i->>'brand', ''),
    COALESCE(NULLIF(e.i->>'qty', '')::numeric, 0),
    COALESCE(NULLIF(e.i->>'price', '')::numeric, 0),
    NULLIF(e.i->>'price_base', '')::numeric,
    COALESCE((e.i->>'is_promo')::boolean, false),
    COALESCE((e.i->>'is_bonus')::boolean, false),
    e.i - 'sku' - 'name' - 'brand' - 'qty' - 'price' - 'price_base' - 'is_promo' - 'is_bonus'
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS e(i, n)
  LEFT JOIN products p ON p.sku = e.i->>'sku'
  WHERE jsonb_typeof(e.i) = 'object';
END;
$$;

REVOKE ALL ON FUNCTION public.fn_order_lines_sync(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_order_lines_sync(uuid, jsonb) TO service_role;

-- ── 3. Тригер-дзеркало ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_order_lines_mirror()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  BEGIN
    PERFORM public.fn_order_lines_sync(NEW.id, NEW.items);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'order_lines mirror failed for order % (#%): %', NEW.id, NEW.order_number, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_order_lines_mirror() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_order_lines_mirror ON public.orders;
CREATE TRIGGER trg_order_lines_mirror
  AFTER INSERT OR UPDATE OF items ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.fn_order_lines_mirror();

-- ── 4. Backfill усіх наявних замовлень ──────────────────────────────────────────
-- Напряму через sync, а не UPDATE orders: не чіпаємо updated_at і не будимо
-- trg_order_status_history.
DO $$
DECLARE r RECORD; n_ok integer := 0; n_fail integer := 0;
BEGIN
  FOR r IN SELECT id, order_number, items FROM public.orders ORDER BY created_at LOOP
    BEGIN
      PERFORM public.fn_order_lines_sync(r.id, r.items);
      n_ok := n_ok + 1;
    EXCEPTION WHEN OTHERS THEN
      n_fail := n_fail + 1;
      RAISE WARNING 'order_lines backfill failed for #%: %', r.order_number, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'order_lines backfill: % ok, % failed', n_ok, n_fail;
END;
$$;

-- ── 5. check_invariants: + I9 (дзеркало) + I10 (total_price = Σ рядків) ─────────
-- Тіло I1–I8 — живе визначення з прода на 31.10.2026 (збігається з 062), без змін.
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

END;
$function$;
