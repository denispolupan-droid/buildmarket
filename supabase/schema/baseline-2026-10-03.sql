--
-- PostgreSQL database dump
--

\restrict afmcTj9FYPI97jedOBuInz5RDrnzifZ2RdthtIdxMGijyen3Xsjg2OzffqmKqkw

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11 (Ubuntu 17.11-1.pgdg24.04+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: apply_landed_costs(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.apply_landed_costs(p_document_id uuid, p_method text) RETURNS numeric
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_total_cost   NUMERIC := 0;
  v_total_base   NUMERIC := 0;
  batch          RECORD;
  v_ratio        NUMERIC;
  v_allocated    NUMERIC;
  v_add_per_unit NUMERIC;
BEGIN
  -- Тільки нерозподілені витрати цього виклику
  SELECT COALESCE(SUM(amount), 0) INTO v_total_cost
  FROM landed_cost_lines
  WHERE document_id = p_document_id AND NOT distributed;

  IF v_total_cost = 0 THEN RETURN 0; END IF;

  -- Вираховуємо базис (бонусні рядки виключені)
  IF p_method = 'by_cost' THEN
    SELECT COALESCE(SUM(sb.initial_qty * sb.cost_price), 0) INTO v_total_base
    FROM stock_batches sb
    WHERE sb.document_id = p_document_id
      AND NOT EXISTS (
        SELECT 1 FROM acc_document_lines dl
        WHERE dl.document_id = p_document_id AND dl.sku = sb.sku AND dl.is_bonus = true
      );
  ELSIF p_method = 'by_qty' THEN
    SELECT COALESCE(SUM(sb.initial_qty), 0) INTO v_total_base
    FROM stock_batches sb
    WHERE sb.document_id = p_document_id
      AND NOT EXISTS (
        SELECT 1 FROM acc_document_lines dl
        WHERE dl.document_id = p_document_id AND dl.sku = sb.sku AND dl.is_bonus = true
      );
  ELSE -- equal
    SELECT COUNT(*) INTO v_total_base
    FROM stock_batches sb
    WHERE sb.document_id = p_document_id
      AND NOT EXISTS (
        SELECT 1 FROM acc_document_lines dl
        WHERE dl.document_id = p_document_id AND dl.sku = sb.sku AND dl.is_bonus = true
      );
  END IF;

  IF v_total_base = 0 THEN RETURN 0; END IF;

  -- Оновлюємо cost_price для кожної НЕбонусної партії
  FOR batch IN
    SELECT sb.id, sb.sku, sb.initial_qty, sb.remaining_qty, sb.cost_price
    FROM stock_batches sb
    WHERE sb.document_id = p_document_id
      AND NOT EXISTS (
        SELECT 1 FROM acc_document_lines dl
        WHERE dl.document_id = p_document_id AND dl.sku = sb.sku AND dl.is_bonus = true
      )
    FOR UPDATE
  LOOP
    IF p_method = 'by_cost' THEN
      v_ratio := (batch.initial_qty * batch.cost_price) / v_total_base;
    ELSIF p_method = 'by_qty' THEN
      v_ratio := batch.initial_qty / v_total_base;
    ELSE
      v_ratio := 1.0 / v_total_base;
    END IF;

    v_allocated    := ROUND(v_total_cost * v_ratio, 4);
    v_add_per_unit := CASE WHEN batch.initial_qty > 0 THEN v_allocated / batch.initial_qty ELSE 0 END;

    UPDATE stock_batches
    SET cost_price = cost_price + v_add_per_unit
    WHERE id = batch.id;
  END LOOP;

  -- Оновлюємо cost_price в рядках документа (тільки НЕбонусні)
  UPDATE acc_document_lines dl
  SET cost_price = dl.cost_price + (
    SELECT ROUND(v_total_cost *
      CASE p_method
        WHEN 'by_cost' THEN (dl.qty * dl.cost_price) / NULLIF(v_total_base, 0)
        WHEN 'by_qty'  THEN dl.qty / NULLIF(v_total_base, 0)
        ELSE 1.0 / NULLIF(v_total_base, 0)
      END / NULLIF(dl.qty, 0), 4)
  )
  WHERE dl.document_id = p_document_id
    AND dl.qty > 0
    AND dl.is_bonus = false;

  -- Позначаємо витрати як розподілені
  UPDATE landed_cost_lines
  SET distributed = TRUE
  WHERE document_id = p_document_id AND NOT distributed;

  -- Оновлюємо документ: landed_cost_total накопичується (не перезаписується!)
  UPDATE acc_documents
  SET landed_cost_total  = COALESCE(landed_cost_total, 0) + v_total_cost,
      landed_cost_method = p_method,
      total_cost         = COALESCE(total_cost, 0) + v_total_cost
  WHERE id = p_document_id;

  -- Синхронізуємо stock_balance.avg_cost (тільки НЕбонусні SKU)
  UPDATE stock_balance bal
  SET
    avg_cost   = agg.weighted_avg,
    updated_at = now()
  FROM (
    SELECT
      sb.warehouse_id,
      sb.sku,
      SUM(sb.remaining_qty * sb.cost_price) / NULLIF(SUM(sb.remaining_qty), 0) AS weighted_avg
    FROM stock_batches sb
    WHERE sb.sku IN (
      SELECT DISTINCT sku FROM stock_batches
      WHERE document_id = p_document_id
        AND NOT EXISTS (
          SELECT 1 FROM acc_document_lines dl
          WHERE dl.document_id = p_document_id AND dl.sku = sb.sku AND dl.is_bonus = true
        )
    )
    GROUP BY sb.warehouse_id, sb.sku
  ) agg
  WHERE bal.sku         = agg.sku
    AND bal.warehouse_id = agg.warehouse_id;

  RETURN v_total_cost;
END;
$$;


--
-- Name: approve_payout(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_payout(p_payout_id uuid, p_admin_email text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_customer_id UUID;
  v_amount      NUMERIC(14,2);
  v_method      TEXT;
  v_status      TEXT;
  v_tx_type     TEXT;
  v_balance     NUMERIC(14,2);
  v_held        NUMERIC(14,2);
BEGIN
  SELECT customer_id, amount, method, status
  INTO   v_customer_id, v_amount, v_method, v_status
  FROM   partner_payout_requests
  WHERE  id = p_payout_id
  FOR    UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Заявку не знайдено');
  END IF;
  IF v_status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', format('Заявка вже оброблена (статус: %s)', v_status));
  END IF;

  SELECT balance, balance_held INTO v_balance, v_held
  FROM customers WHERE id = v_customer_id FOR UPDATE;

  IF v_balance < v_amount THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('Баланс партнера (%s ₴) менший за суму заявки (%s ₴)', round(v_balance, 2), v_amount));
  END IF;

  v_tx_type := CASE WHEN v_method = 'goods_offset' THEN 'goods_offset' ELSE 'payout' END;

  INSERT INTO partner_balance_transactions (customer_id, tx_type, amount, description, created_by)
  VALUES (v_customer_id, v_tx_type, -v_amount, format('Виплата підтверджена: %s', p_admin_email), p_admin_email);

  UPDATE customers SET balance_held = GREATEST(0, balance_held - v_amount) WHERE id = v_customer_id;

  UPDATE partner_payout_requests
  SET status = 'approved', processed_at = NOW(), processed_by = p_admin_email
  WHERE id = p_payout_id;

  RETURN jsonb_build_object('success', true, 'tx_type', v_tx_type, 'amount', v_amount);
END;
$$;


--
-- Name: assert_period_open(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assert_period_open(p_date date) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if exists (
    select 1 from acc_periods
    where period = date_trunc('month', p_date)::date
      and closed_at is not null
  ) then
    raise exception 'Період % закрито — проводки з цією датою заборонені', to_char(p_date, 'YYYY-MM');
  end if;
end;
$$;


--
-- Name: bump_ai_bot_hit(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bump_ai_bot_hit(p_bot text, p_section text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  insert into public.ai_bot_hits (day, bot, section, hits)
  values ((now() at time zone 'Europe/Kyiv')::date, p_bot, p_section, 1)
  on conflict (day, bot, section) do update set hits = public.ai_bot_hits.hits + 1;
$$;


--
-- Name: bump_ai_referral(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bump_ai_referral(p_source text, p_path text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  insert into public.ai_referrals (day, source, landing_path, hits)
  values ((now() at time zone 'Europe/Kyiv')::date, p_source, left(p_path, 300), 1)
  on conflict (day, source, landing_path) do update set hits = public.ai_referrals.hits + 1;
$$;


--
-- Name: charge_partner_balance(uuid, numeric, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.charge_partner_balance(p_customer_id uuid, p_amount numeric, p_order_id uuid DEFAULT NULL::uuid, p_description text DEFAULT ''::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_balance   NUMERIC;
  v_held      NUMERIC;
  v_available NUMERIC;
BEGIN
  -- Блокуємо рядок: інші запити чекатимуть поки ця транзакція завершиться
  SELECT balance, balance_held
  INTO   v_balance, v_held
  FROM   customers
  WHERE  id = p_customer_id
  FOR    UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Партнера не знайдено');
  END IF;

  v_available := v_balance - v_held;

  IF v_available < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'error',   format(
        'Недостатньо балансу. Доступно: %s ₴, потрібно: %s ₴',
        round(v_available, 2), round(p_amount, 2)
      )
    );
  END IF;

  -- Вставляємо транзакцію — тригер trg_update_partner_balance
  -- автоматично оновить customers.balance
  INSERT INTO partner_balance_transactions
    (customer_id, tx_type, amount, order_id, description, created_by)
  VALUES
    (p_customer_id, 'charge', -p_amount, p_order_id, p_description, 'system');

  RETURN jsonb_build_object('success', true);
END;
$$;


--
-- Name: check_balance_integrity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_balance_integrity() RETURNS TABLE(customer_id uuid, stored_balance numeric, computed_balance numeric, drift numeric)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT
    c.id                                              AS customer_id,
    c.balance                                         AS stored_balance,
    COALESCE(SUM(t.amount), 0)                        AS computed_balance,
    c.balance - COALESCE(SUM(t.amount), 0)            AS drift
  FROM customers c
  LEFT JOIN partner_balance_transactions t ON t.customer_id = c.id
  GROUP BY c.id, c.balance
  HAVING ABS(c.balance - COALESCE(SUM(t.amount), 0)) > 0.005;
$$;


--
-- Name: check_invariants(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_invariants() RETURNS TABLE(invariant text, status text, details text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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

END;
$$;


--
-- Name: check_receipt_quantities(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_receipt_quantities(p_receipt_id uuid) RETURNS TABLE(sku text, ordered numeric, effective numeric, already_received numeric, this_receipt numeric, would_exceed boolean)
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    rl.sku,
    ps.ordered_qty,
    ps.effective_ordered_qty,
    ps.received_qty,
    rl.qty   AS this_receipt,
    (ps.received_qty + rl.qty) > ps.effective_ordered_qty AS would_exceed
  FROM acc_document_lines rl
  JOIN acc_documents rd ON rd.id = rl.document_id
  LEFT JOIN procurement_summary ps
    ON ps.po_id = rd.parent_doc_id AND ps.sku = rl.sku
  WHERE rl.document_id = p_receipt_id
    AND rd.doc_type IN ('receipt','stock_in')
    AND ps.effective_ordered_qty IS NOT NULL;
END;
$$;


--
-- Name: check_secdef_exposure(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_secdef_exposure() RETURNS TABLE(func text)
    LANGUAGE sql
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT p.oid::regprocedure::text
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public'
    AND  p.prosecdef
    AND (has_function_privilege('anon', p.oid, 'EXECUTE')
      OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  ORDER BY 1;
$$;


--
-- Name: close_period(date, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.close_period(p_month date, p_by text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_period date := date_trunc('month', p_month)::date;
  v_fails  int;
begin
  if v_period >= date_trunc('month', current_date)::date then
    raise exception 'Не можна закрити поточний або майбутній місяць';
  end if;

  select count(*) into v_fails from check_invariants() where status = 'FAIL';
  if v_fails > 0 then
    raise exception 'Інваріанти обліку FAIL (%) — спочатку виправте розбіжності', v_fails;
  end if;

  insert into acc_periods (period, closed_at, closed_by)
  values (v_period, now(), p_by)
  on conflict (period) do update set closed_at = now(), closed_by = excluded.closed_by;

  return 'closed:' || to_char(v_period, 'YYYY-MM');
end;
$$;


--
-- Name: consume_stock_fifo(text, integer, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.consume_stock_fifo(p_sku text, p_warehouse_id integer, p_qty numeric) RETURNS numeric
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
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

  IF v_remaining > 0.000001 THEN
    RAISE EXCEPTION 'FIFO: недостатньо партій для % на складі %: потрібно %, не вистачає %',
      p_sku, p_warehouse_id, p_qty, v_remaining;
  END IF;

  RETURN v_total_cost;
END;
$$;


--
-- Name: create_stock_batch(text, integer, numeric, numeric, timestamp with time zone, integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_stock_batch(p_sku text, p_warehouse_id integer, p_qty numeric, p_cost_price numeric DEFAULT 0, p_received_at timestamp with time zone DEFAULT now(), p_supplier_id integer DEFAULT NULL::integer, p_document_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
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


--
-- Name: credit_cod_to_partner(uuid, numeric, numeric, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.credit_cod_to_partner(p_customer_id uuid, p_cod_amount numeric, p_np_fee_pct numeric DEFAULT 0.5, p_order_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_np_fee NUMERIC;
BEGIN
  IF p_order_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM partner_balance_transactions
    WHERE order_id = p_order_id AND tx_type = 'cod_credit'
  ) THEN
    RETURN jsonb_build_object('success', true, 'skipped', 'already_credited');
  END IF;

  IF p_cod_amount IS NULL OR p_cod_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Сума наложки має бути більшою за 0');
  END IF;

  v_np_fee := round(p_cod_amount * p_np_fee_pct / 100, 2);

  INSERT INTO partner_balance_transactions
    (customer_id, tx_type, amount, order_id, description, created_by)
  VALUES
    (p_customer_id, 'cod_credit', p_cod_amount, p_order_id,
     format('Накладений платіж отримано: %s ₴', p_cod_amount), 'system');

  IF v_np_fee > 0 THEN
    INSERT INTO partner_balance_transactions
      (customer_id, tx_type, amount, order_id, description, created_by)
    VALUES
      (p_customer_id, 'np_fee', -v_np_fee, p_order_id,
       format('Комісія НоваПей %s%%: %s ₴', p_np_fee_pct, v_np_fee), 'system');
  END IF;

  RETURN jsonb_build_object('success', true, 'credited', p_cod_amount - v_np_fee, 'np_fee', v_np_fee);
END;
$$;


--
-- Name: customer_display_name(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.customer_display_name(p_company text, p_legal_name text, p_name text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT COALESCE(NULLIF(trim(p_company), ''), NULLIF(trim(p_legal_name), ''), trim(p_name))
$$;


--
-- Name: ensure_marketplace_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_marketplace_sync() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'cron', 'net'
    AS $$
declare
  v_desired  int;
  v_expr     text;
  v_repaired boolean := false;
  v_jobs     jsonb;
  v_stale    jsonb;
begin
  v_desired := coalesce(nullif((select value from public.app_settings where key = 'marketplace_sync_interval_min'), '')::int, 15);
  if v_desired not in (5, 10, 15, 30, 60) then v_desired := 15; end if;
  v_expr := case when v_desired = 60 then '0 * * * *' else '*/' || v_desired || ' * * * *' end;

  if not exists (select 1 from cron.job where jobname = 'rozetka-orders-sync' and active and schedule = v_expr)
     or not exists (select 1 from cron.job where jobname = 'prom-orders-sync' and active and schedule = v_expr) then
    perform public.set_marketplace_sync_interval(v_desired);
    v_repaired := true;
  end if;

  select jsonb_agg(jsonb_build_object('name', jobname, 'schedule', schedule, 'active', active))
    into v_jobs from cron.job where jobname in ('rozetka-orders-sync', 'prom-orders-sync');

  if v_repaired then
    v_stale := '[]'::jsonb;
  else
    select coalesce(jsonb_agg(j.jobname), '[]'::jsonb) into v_stale
    from cron.job j
    where j.jobname in ('rozetka-orders-sync', 'prom-orders-sync')
      and exists (select 1 from cron.job_run_details d where d.jobid = j.jobid)
      and not exists (
        select 1 from cron.job_run_details d
        where d.jobid = j.jobid and d.start_time > now() - make_interval(mins => v_desired * 3)
      );
  end if;

  return jsonb_build_object(
    'repaired', v_repaired, 'desired_min', v_desired, 'expected', v_expr,
    'jobs', coalesce(v_jobs, '[]'::jsonb), 'stale', v_stale
  );
end;
$$;


--
-- Name: expire_stock_reservations(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expire_stock_reservations() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_count INT;
BEGIN
  WITH expired AS (
    UPDATE stock_reservations sr
    SET released_at        = NOW(),
        reservation_status = 'expired',
        release_reason     = 'expired'
    FROM orders o
    WHERE sr.order_id = o.id
      AND sr.reservation_status = 'active'
      AND sr.expires_at IS NOT NULL
      AND sr.expires_at < NOW()
      AND o.status IN ('new', 'confirmed', 'awaiting_stock', 'picking')
    RETURNING sr.warehouse_id
  )
  SELECT COUNT(*) INTO v_count FROM expired;
  RETURN v_count;
END;
$$;


--
-- Name: fn_batch_avg_cost_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_batch_avg_cost_sync() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE stock_balance
  SET    avg_cost   = fn_recalc_avg_cost(NEW.sku, NEW.warehouse_id),
         updated_at = NOW()
  WHERE  sku          = NEW.sku
    AND  warehouse_id = NEW.warehouse_id;

  RETURN NEW;
END;
$$;


--
-- Name: fn_clear_price_lock_on_empty_stock(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_clear_price_lock_on_empty_stock() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- Перевіряємо: чи є хоч один склад з qty_total > 0 для цього SKU
  IF NOT EXISTS (
    SELECT 1 FROM stock_balance
    WHERE sku = NEW.sku AND qty_total > 0
  ) THEN
    UPDATE product_stock
    SET price_locked = false
    WHERE sku = NEW.sku AND price_locked = true;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: fn_create_supplier_warehouse(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_create_supplier_warehouse() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  INSERT INTO warehouses (slug, name, warehouse_type, supplier_id, is_active, sort_order)
  VALUES (
    'supplier-' || NEW.slug,
    NEW.name || ' (дроп)',
    'supplier',
    NEW.id,
    NEW.is_active,
    100
  )
  ON CONFLICT (slug) DO NOTHING;
  RETURN NEW;
END;
$$;


--
-- Name: fn_generate_order_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_generate_order_number() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
  DECLARE
    v_ym  CHAR(4);
    v_seq INTEGER;
  BEGIN
    v_ym := to_char(NOW() AT TIME ZONE 'Europe/Kyiv', 'YYMM');
    v_ym := to_char(NOW() AT TIME ZONE 'Europe/Kyiv', 'YYMM');
    INSERT INTO order_number_seq (ym, last_val)
    VALUES (v_ym, 1000)
    ON CONFLICT (ym) DO UPDATE
      SET last_val = order_number_seq.last_val + 1
    RETURNING last_val INTO v_seq;
    NEW.order_number := (v_ym || lpad(v_seq::text, 4, '0'))::BIGINT;
    RETURN NEW;
  END;
  $$;


--
-- Name: fn_guard_closed_period(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_guard_closed_period() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  perform assert_period_open(new.business_date);
  return new;
end;
$$;


--
-- Name: fn_guard_money_entries(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_guard_money_entries() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  RAISE EXCEPTION 'money_entries є append-only. Використовуйте компенсуючий запис.';
  RETURN NULL;
END;
$$;


--
-- Name: fn_guard_stock_movements(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_guard_stock_movements() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  RAISE EXCEPTION
    'stock_movements is append-only. Use a reversal document instead.';
END;
$$;


--
-- Name: fn_increment_promo_uses(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_increment_promo_uses() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE promo_codes SET uses_count = uses_count + 1 WHERE id = NEW.promo_id;
  RETURN NEW;
END;
$$;


--
-- Name: fn_queue_price_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_queue_price_sync() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.price_type IN ('retail','wholesale','drop') THEN
    INSERT INTO marketplace_sync_queue
      (listing_id, sku, marketplace_id, sync_type, payload)
    SELECT
      ml.id,
      NEW.sku,
      ml.marketplace_id,
      'price',
      jsonb_build_object(
        'price_type', NEW.price_type,
        'price_new',  NEW.price_new
      )
    FROM marketplace_listings ml
    JOIN marketplace_accounts ma ON ml.marketplace_id = ma.id
    WHERE ml.sku = NEW.sku
      AND ml.is_listed = true
      AND ml.price_strategy = 'standard'
      AND ma.is_active = true
    ON CONFLICT (listing_id, sync_type) WHERE status = 'pending'
    DO UPDATE SET
      payload   = EXCLUDED.payload,
      queued_at = NOW();
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: fn_queue_stock_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_queue_stock_sync() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_qty_available NUMERIC;
BEGIN
  IF OLD.qty_total IS DISTINCT FROM NEW.qty_total
    OR OLD.qty_reserved IS DISTINCT FROM NEW.qty_reserved
  THEN
    -- Помечаем листинги как требующие синхронизации
    UPDATE marketplace_listings ml
    SET needs_sync = true
    FROM marketplace_accounts ma
    WHERE ml.sku = NEW.sku
      AND ml.marketplace_id = ma.id
      AND ml.is_listed = true
      AND ma.is_active = true;

    -- Добавляем в очередь (один pending на листинг — обновляем если уже есть)
    INSERT INTO marketplace_sync_queue
      (listing_id, sku, marketplace_id, sync_type, payload)
    SELECT
      ml.id,
      NEW.sku,
      ml.marketplace_id,
      'stock',
      jsonb_build_object('qty',
        GREATEST(0,
          COALESCE(NEW.qty_available, 0) - COALESCE(ml.qty_buffer, 0)
        )
      )
    FROM marketplace_listings ml
    JOIN marketplace_accounts ma ON ml.marketplace_id = ma.id
    WHERE ml.sku = NEW.sku
      AND ml.is_listed = true
      AND ma.is_active = true
    ON CONFLICT (listing_id, sync_type) WHERE status = 'pending'
    DO UPDATE SET
      payload   = EXCLUDED.payload,
      queued_at = NOW();
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: fn_recalc_avg_cost(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_recalc_avg_cost(p_sku text, p_warehouse_id integer) RETURNS numeric
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT COALESCE(
    SUM(cost_price * remaining_qty) / NULLIF(SUM(remaining_qty), 0),
    0
  )
  FROM stock_batches
  WHERE sku          = p_sku
    AND warehouse_id = p_warehouse_id
    AND remaining_qty > 0;
$$;


--
-- Name: fn_supplier_stock_changed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_supplier_stock_changed() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  PERFORM sync_product_stock_from_suppliers(NEW.sku);
  RETURN NEW;
END;
$$;


--
-- Name: fn_track_order_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_track_order_status() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO order_status_history (order_id, status_from, status_to, changed_by)
    VALUES (NEW.id::UUID, OLD.status, NEW.status, current_setting('app.current_user', true));
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: fn_track_price_history(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_track_price_history() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF OLD.price_cost IS DISTINCT FROM NEW.price_cost AND NEW.price_cost IS NOT NULL THEN
    INSERT INTO price_history (sku, price_type, price_old, price_new, source)
    VALUES (NEW.sku, 'cost', OLD.price_cost, NEW.price_cost, 'sync');
  END IF;
  IF OLD.price_unit IS DISTINCT FROM NEW.price_unit THEN
    INSERT INTO price_history (sku, price_type, price_old, price_new, source)
    VALUES (NEW.sku, 'retail', OLD.price_unit, NEW.price_unit, 'sync');
  END IF;
  IF OLD.price_drop IS DISTINCT FROM NEW.price_drop AND NEW.price_drop IS NOT NULL THEN
    INSERT INTO price_history (sku, price_type, price_old, price_new, source)
    VALUES (NEW.sku, 'drop', OLD.price_drop, NEW.price_drop, 'sync');
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: fn_update_counterparty_balance(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_update_counterparty_balance() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.counterparty_id IS NOT NULL THEN
    INSERT INTO counterparty_balances (counterparty_id, account_type, currency, balance)
    VALUES (NEW.counterparty_id, NEW.account_type, NEW.currency, NEW.amount)
    ON CONFLICT (counterparty_id, account_type, currency)
    DO UPDATE SET
      balance    = counterparty_balances.balance + NEW.amount,
      updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: fn_update_partner_balance(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_update_partner_balance() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_new_balance NUMERIC(14,2);
BEGIN
  UPDATE customers
  SET balance = balance + NEW.amount
  WHERE id = NEW.customer_id
  RETURNING balance INTO v_new_balance;

  UPDATE partner_balance_transactions
  SET balance_after = v_new_balance
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;


--
-- Name: fn_update_po_status_on_receipt(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_update_po_status_on_receipt() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_po_id UUID;
  v_remaining NUMERIC;
BEGIN
  -- Тільки при підтвердженні receipt/stock_in
  IF NEW.doc_type NOT IN ('receipt','stock_in') THEN RETURN NEW; END IF;
  IF NEW.status <> 'confirmed' OR OLD.status = 'confirmed' THEN RETURN NEW; END IF;

  v_po_id := NEW.parent_doc_id;
  IF v_po_id IS NULL THEN RETURN NEW; END IF;

  -- Рахуємо залишок
  SELECT COALESCE(SUM(remaining_qty), 0) INTO v_remaining
  FROM procurement_summary WHERE po_id = v_po_id;

  -- Оновлюємо po_status на PO
  UPDATE acc_documents
  SET po_status = CASE
    WHEN v_remaining <= 0 THEN 'received'
    ELSE 'partially_received'
  END
  WHERE id = v_po_id AND doc_type = 'purchase_order';

  RETURN NEW;
END;
$$;


--
-- Name: fn_update_stock_balance(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_update_stock_balance() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.qty >= 0 THEN
    -- Прихід: INSERT або UPDATE (нова позиція або додаємо до існуючої)
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
  ELSE
    -- Продаж / списання: тільки UPDATE (не можна продати те, чого немає)
    UPDATE stock_balance SET
      qty_total  = qty_total + NEW.qty,
      avg_cost   = fn_recalc_avg_cost(NEW.sku, NEW.warehouse_id),
      updated_at = NOW()
    WHERE warehouse_id = NEW.warehouse_id AND sku = NEW.sku;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: fn_update_stock_reserved(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_update_stock_reserved() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE stock_balance
    SET  qty_reserved = qty_reserved + NEW.qty,
         updated_at   = NOW()
    WHERE warehouse_id = NEW.warehouse_id
      AND sku          = NEW.sku;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'stock_balance not found for sku=%, warehouse_id=% when adding reservation',
        NEW.sku, NEW.warehouse_id;
    END IF;

  ELSIF TG_OP = 'UPDATE'
    AND OLD.released_at IS NULL
    AND NEW.released_at IS NOT NULL
  THEN
    UPDATE stock_balance
    SET  qty_reserved = GREATEST(0, qty_reserved - OLD.qty),
         updated_at   = NOW()
    WHERE warehouse_id = OLD.warehouse_id
      AND sku          = OLD.sku;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: guard_user_metadata(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guard_user_metadata() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.raw_user_meta_data ? 'role' THEN
    NEW.raw_user_meta_data := NEW.raw_user_meta_data - 'role';
  END IF;

  IF TG_OP = 'INSERT' AND NEW.raw_user_meta_data ? 'account_type' THEN
    NEW.raw_app_meta_data := coalesce(NEW.raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('account_type', NEW.raw_user_meta_data ->> 'account_type');
  END IF;

  RETURN NEW;
END $$;


--
-- Name: increment_promo_used(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_promo_used(p_code text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  UPDATE promo_codes SET uses_count = uses_count + 1 WHERE code = p_code;
$$;


--
-- Name: mark_absent_supplier_stock(integer, timestamp with time zone, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_absent_supplier_stock(p_supplier_id integer, p_sync_started timestamp with time zone, p_rows_in_file integer, p_prev_rows integer DEFAULT NULL::integer) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_marked INT := 0;
  v_is_full_file BOOLEAN;
BEGIN
  -- Захист від неповного файлу: якщо < 60% від попереднього — не скидаємо
  v_is_full_file := (p_prev_rows IS NULL)
    OR (p_rows_in_file >= p_prev_rows * 0.6);

  IF NOT v_is_full_file THEN
    RAISE NOTICE 'Partial file detected (% vs prev %). Skipping absent mark.', p_rows_in_file, p_prev_rows;
    RETURN 0;
  END IF;

  -- Позначаємо товари що НЕ були оновлені в цьому синку
  WITH absent AS (
    UPDATE supplier_stock
    SET stock_status = 'out_of_stock',
        stock_qty    = 0,
        updated_at   = NOW()
    WHERE supplier_id    = p_supplier_id
      AND last_synced_at < p_sync_started
    RETURNING sku
  )
  SELECT COUNT(*) INTO v_marked FROM absent;

  -- Оновлюємо агреговані залишки для всіх змінених товарів
  PERFORM sync_product_stock_from_suppliers(sku)
  FROM (
    SELECT DISTINCT sku FROM supplier_stock
    WHERE supplier_id = p_supplier_id
      AND last_synced_at < p_sync_started
  ) t;

  RETURN v_marked;
END;
$$;


--
-- Name: next_ar_correction_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_ar_correction_number() RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_year TEXT := to_char(NOW(), 'YYYY');
  v_num  INTEGER;
BEGIN
  SELECT nextval('ar_correction_seq') INTO v_num;
  RETURN 'КД-' || v_year || '-' || LPAD(v_num::TEXT, 4, '0');
END;
$$;


--
-- Name: next_doc_number(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_doc_number(p_type text) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_year   INT;
  v_num    INT;
  v_prefix TEXT;
BEGIN
  v_year := EXTRACT(YEAR FROM NOW())::INT;

  UPDATE acc_doc_sequences
  SET last_number = 0, year = v_year
  WHERE doc_type = p_type AND year < v_year;

  UPDATE acc_doc_sequences
  SET last_number = last_number + 1
  WHERE doc_type = p_type
  RETURNING last_number, prefix INTO v_num, v_prefix;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown doc_type: %', p_type;
  END IF;

  RETURN v_prefix || '-' || v_year || '-' || LPAD(v_num::TEXT, 4, '0');
END;
$$;


--
-- Name: open_period(date, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.open_period(p_month date, p_by text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  v_period date := date_trunc('month', p_month)::date;
begin
  update acc_periods set closed_at = null, closed_by = p_by where period = v_period;
  return 'opened:' || to_char(v_period, 'YYYY-MM');
end;
$$;


--
-- Name: reconcile_orphan_stock(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reconcile_orphan_stock() RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE v_count INT;
BEGIN
  WITH orphans AS (
    UPDATE product_stock
    SET stock_status = 'out_of_stock',
        stock_qty    = 0,
        updated_at   = NOW()
    WHERE stock_status = 'in_stock'
      AND NOT EXISTS (
        SELECT 1 FROM supplier_stock ss
        WHERE ss.sku = product_stock.sku AND ss.stock_status = 'in_stock'
      )
      AND NOT EXISTS (
        SELECT 1 FROM stock_balance sb
        JOIN warehouses w ON w.id = sb.warehouse_id
        WHERE sb.sku = product_stock.sku
          AND sb.qty_total > 0
          AND w.warehouse_type != 'supplier'
      )
    RETURNING sku
  )
  SELECT COUNT(*) INTO v_count FROM orphans;
  RETURN v_count;
END;
$$;


--
-- Name: record_money_txn(text, text, text, text, numeric, text, date, uuid, text, uuid, uuid, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_money_txn(p_debit_account text, p_debit_party text, p_credit_account text, p_credit_party text, p_amount numeric, p_currency text DEFAULT 'UAH'::text, p_business_date date DEFAULT CURRENT_DATE, p_doc_id uuid DEFAULT NULL::uuid, p_doc_type text DEFAULT NULL::text, p_order_id uuid DEFAULT NULL::uuid, p_contract_id uuid DEFAULT NULL::uuid, p_description text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text, p_created_by text DEFAULT NULL::text, p_meta jsonb DEFAULT '{}'::jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_txn_id UUID := gen_random_uuid();
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM money_entries WHERE idempotency_key = p_idempotency_key) THEN
      SELECT txn_id INTO v_txn_id FROM money_entries WHERE idempotency_key = p_idempotency_key LIMIT 1;
      RETURN v_txn_id;
    END IF;
  END IF;

  INSERT INTO money_entries
    (txn_id, account_type, counterparty_id, contract_id, amount, currency,
     doc_id, doc_type, order_id, description, idempotency_key, business_date, created_by, meta)
  VALUES
    (v_txn_id, p_debit_account, p_debit_party, p_contract_id, p_amount, p_currency,
     p_doc_id, p_doc_type, p_order_id, p_description,
     p_idempotency_key, p_business_date, p_created_by, p_meta);

  INSERT INTO money_entries
    (txn_id, account_type, counterparty_id, contract_id, amount, currency,
     doc_id, doc_type, order_id, description, business_date, created_by, meta)
  VALUES
    (v_txn_id, p_credit_account, p_credit_party, p_contract_id, -p_amount, p_currency,
     p_doc_id, p_doc_type, p_order_id, p_description,
     p_business_date, p_created_by, p_meta);

  RETURN v_txn_id;
END;
$$;


--
-- Name: record_money_txn_legs(text, text, uuid, uuid, text, text, uuid, uuid, numeric, date, uuid, text, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_money_txn_legs(p_debit_account text, p_debit_party text, p_debit_order_id uuid, p_debit_contract_id uuid, p_credit_account text, p_credit_party text, p_credit_order_id uuid, p_credit_contract_id uuid, p_amount numeric, p_business_date date DEFAULT CURRENT_DATE, p_doc_id uuid DEFAULT NULL::uuid, p_doc_type text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text, p_created_by text DEFAULT NULL::text, p_meta jsonb DEFAULT '{}'::jsonb) RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_txn_id UUID := gen_random_uuid();
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Сума проводки має бути більшою за нуль';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT txn_id INTO v_txn_id FROM money_entries WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF FOUND THEN RETURN v_txn_id; END IF;
    v_txn_id := gen_random_uuid();
  END IF;

  INSERT INTO money_entries
    (txn_id, account_type, counterparty_id, contract_id, amount, currency,
     doc_id, doc_type, order_id, description, idempotency_key, business_date, created_by, meta)
  VALUES
    (v_txn_id, p_debit_account, p_debit_party, p_debit_contract_id, p_amount, 'UAH',
     p_doc_id, p_doc_type, p_debit_order_id, p_description, p_idempotency_key, p_business_date, p_created_by, p_meta);

  INSERT INTO money_entries
    (txn_id, account_type, counterparty_id, contract_id, amount, currency,
     doc_id, doc_type, order_id, description, business_date, created_by, meta)
  VALUES
    (v_txn_id, p_credit_account, p_credit_party, p_credit_contract_id, -p_amount, 'UAH',
     p_doc_id, p_doc_type, p_credit_order_id, p_description, p_business_date, p_created_by, p_meta);

  RETURN v_txn_id;
END;
$$;


--
-- Name: refund_partner_balance(uuid, numeric, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.refund_partner_balance(p_customer_id uuid, p_amount numeric, p_order_id uuid DEFAULT NULL::uuid, p_description text DEFAULT 'Повернення коштів'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  INSERT INTO partner_balance_transactions
    (customer_id, tx_type, amount, order_id, description, created_by)
  VALUES
    (p_customer_id, 'return_refund', p_amount, p_order_id, p_description, 'system');

  RETURN jsonb_build_object('success', true);
END;
$$;


--
-- Name: reject_payout(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_payout(p_payout_id uuid, p_admin_email text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_customer_id UUID;
  v_amount      NUMERIC(14,2);
  v_status      TEXT;
BEGIN
  SELECT customer_id, amount, status
  INTO   v_customer_id, v_amount, v_status
  FROM   partner_payout_requests
  WHERE  id = p_payout_id
  FOR    UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Заявку не знайдено');
  END IF;
  IF v_status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', format('Заявка вже оброблена (статус: %s)', v_status));
  END IF;

  UPDATE customers SET balance_held = GREATEST(0, balance_held - v_amount) WHERE id = v_customer_id;

  UPDATE partner_payout_requests
  SET status = 'rejected', processed_at = NOW(), processed_by = p_admin_email
  WHERE id = p_payout_id;

  RETURN jsonb_build_object('success', true);
END;
$$;


--
-- Name: release_order_reservations(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_order_reservations(p_order_id uuid, p_reason text DEFAULT 'manual'::text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
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


--
-- Name: reserve_order_items(uuid, integer, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reserve_order_items(p_order_id uuid, p_warehouse_id integer, p_items jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
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


--
-- Name: reserve_order_items(uuid, integer, jsonb, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reserve_order_items(p_order_id uuid, p_warehouse_id integer, p_items jsonb, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_item      JSONB;
  v_sku       TEXT;
  v_qty       NUMERIC;
  v_avail     NUMERIC;
  v_reserved  JSONB := '[]'::JSONB;
  v_insuff    JSONB := '[]'::JSONB;
BEGIN
  -- Блокуємо рядки stock_balance для атомарності
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


--
-- Name: reset_accounting_test_data(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reset_accounting_test_data() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  non_test_count INT;
BEGIN
  SELECT COUNT(*) INTO non_test_count
  FROM acc_documents
  WHERE (meta->>'test')::boolean IS NOT TRUE;

  IF non_test_count > 0 THEN
    RETURN format(
      'REFUSED: %s non-test documents exist. '
      'Only call this when all data has meta.test=true.',
      non_test_count
    );
  END IF;

  -- TRUNCATE обходить append-only тригери (fn_guard_stock_movements, fn_guard_money_entries)
  TRUNCATE
    money_entries,
    counterparty_balances,
    stock_movements,
    stock_batches,
    stock_reservations,
    stock_balance,
    acc_document_lines,
    acc_documents
  RESTART IDENTITY CASCADE;

  RETURN 'OK: accounting tables reset';
END;
$$;


--
-- Name: search_prom_categories(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_prom_categories(q text DEFAULT ''::text, lim integer DEFAULT 20) RETURNS TABLE(prom_category_id bigint, name text, path text, commission_single numeric, commission_ecom numeric, commission_more numeric, commission_turbo numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
  SELECT
    prom_category_id, name, path,
    commission_single, commission_ecom, commission_more, commission_turbo
  FROM prom_commissions_ref
  WHERE
    CASE
      WHEN q = ''        THEN true
      WHEN q ~ '^\d+$'  THEN prom_category_id::text LIKE q || '%'
      ELSE                    name ILIKE '%' || q || '%'
    END
  ORDER BY name
  LIMIT lim;
$_$;


--
-- Name: set_marketplace_sync_interval(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_marketplace_sync_interval(p_minutes integer) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'cron', 'net'
    AS $_$
declare
  v_expr  text;
  v_token text := 'd942e43e7d4bbfd439a568bc6d34a553d445ce5db3314269b4c041484aee25c7';
  v_base  text := 'https://fixline.com.ua/api/cron/';
  v_ch    text;
begin
  if p_minutes not in (5, 10, 15, 30, 60) then
    raise exception 'Недопустимий інтервал %; дозволено 5, 10, 15, 30, 60 хв', p_minutes;
  end if;
  v_expr := case when p_minutes = 60 then '0 * * * *' else '*/' || p_minutes || ' * * * *' end;

  foreach v_ch in array array['rozetka', 'prom'] loop
    perform cron.unschedule(jobid) from cron.job
      where jobname in (v_ch || '-orders-sync', v_ch || '-orders-every-15m');
    perform cron.schedule(
      v_ch || '-orders-sync',
      v_expr,
      format($c$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb)$c$,
             v_base || v_ch || '-orders',
             '{"Authorization": "Bearer ' || v_token || '"}')
    );
  end loop;

  insert into public.app_settings(key, value) values ('marketplace_sync_interval_min', p_minutes::text)
    on conflict (key) do update set value = excluded.value;

  return v_expr;
end;
$_$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: submit_payout_request(uuid, numeric, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_payout_request(p_auth_user_id uuid, p_amount numeric, p_method text, p_bank_details text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_customer_id UUID;
  v_balance     NUMERIC(14,2);
  v_held        NUMERIC(14,2);
  v_available   NUMERIC(14,2);
BEGIN
  IF p_amount IS NULL OR p_amount < 500 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Мінімальна сума — 500 ₴');
  END IF;
  IF p_method NOT IN ('bank', 'goods_offset') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Невірний спосіб виплати');
  END IF;
  IF p_method = 'bank' AND coalesce(trim(p_bank_details), '') = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Вкажіть реквізити для переказу');
  END IF;

  SELECT id, balance, balance_held
  INTO   v_customer_id, v_balance, v_held
  FROM   customers
  WHERE  auth_user_id = p_auth_user_id
  FOR    UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Партнера не знайдено');
  END IF;

  v_available := v_balance - v_held;
  IF v_available < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('Недостатньо коштів. Доступно: %s ₴', round(v_available, 2)));
  END IF;

  IF EXISTS (
    SELECT 1 FROM partner_payout_requests
    WHERE customer_id = v_customer_id
      AND status = 'pending'
      AND amount = p_amount
      AND requested_at > NOW() - INTERVAL '60 seconds'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Така заявка вже подана — зачекайте хвилину');
  END IF;

  INSERT INTO partner_payout_requests (customer_id, amount, method, bank_details, status)
  VALUES (v_customer_id, p_amount, p_method, p_bank_details, 'pending');

  UPDATE customers SET balance_held = balance_held + p_amount WHERE id = v_customer_id;

  RETURN jsonb_build_object('success', true, 'available_after', v_available - p_amount);
END;
$$;


--
-- Name: sync_customer_name_to_contracts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_customer_name_to_contracts() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_old_name text;
  v_new_name text;
BEGIN
  v_old_name := customer_display_name(OLD.company, OLD.legal_name, OLD.name);
  v_new_name := customer_display_name(NEW.company, NEW.legal_name, NEW.name);

  -- Оновлюємо тільки якщо ім'я справді змінилось
  IF v_new_name IS DISTINCT FROM v_old_name THEN
    UPDATE customer_contracts
    SET customer_name = v_new_name,
        updated_at    = now()
    WHERE customer_id = NEW.id::text;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: sync_product_stock_from_suppliers(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_product_stock_from_suppliers(p_sku text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_best supplier_stock%ROWTYPE;
  v_has_physical BOOLEAN := FALSE;
BEGIN
  -- Перевіряємо фізичний залишок на власних складах
  SELECT EXISTS (
    SELECT 1 FROM stock_balance sb
    JOIN warehouses w ON w.id = sb.warehouse_id
    WHERE sb.sku = p_sku
      AND sb.qty_total > 0
      AND w.warehouse_type != 'supplier'
  ) INTO v_has_physical;

  -- Знаходимо найкращого постачальника (за пріоритетом)
  SELECT ss.* INTO v_best
  FROM supplier_stock ss
  JOIN suppliers s ON s.id = ss.supplier_id
  WHERE ss.sku = p_sku
    AND ss.stock_status = 'in_stock'
  ORDER BY COALESCE(ss.priority_override, s.priority) ASC, s.id ASC
  LIMIT 1;

  IF v_best.sku IS NOT NULL OR v_has_physical THEN
    UPDATE product_stock SET
      stock_qty    = COALESCE(v_best.stock_qty, 0),
      stock_status = 'in_stock',
      price_unit   = COALESCE(v_best.price_unit, price_unit),
      price_cost   = COALESCE(v_best.price_cost, price_cost),
      updated_at   = NOW()
    WHERE sku = p_sku
      -- Запобіжник: не переписуємо рядок тими самими значеннями.
      -- COALESCE(v_best.X, X) зліва й справа дає «не змінюємо», коли постачальник
      -- ціни не дав, — умова чесно стає хибною, і запису не буде.
      AND (
           stock_qty    IS DISTINCT FROM COALESCE(v_best.stock_qty, 0)
        OR stock_status IS DISTINCT FROM 'in_stock'
        OR price_unit   IS DISTINCT FROM COALESCE(v_best.price_unit, price_unit)
        OR price_cost   IS DISTINCT FROM COALESCE(v_best.price_cost, price_cost)
      );
  ELSE
    UPDATE product_stock SET
      stock_qty    = 0,
      stock_status = 'out_of_stock',
      updated_at   = NOW()
    WHERE sku = p_sku
      AND (
           stock_qty    IS DISTINCT FROM 0
        OR stock_status IS DISTINCT FROM 'out_of_stock'
      );
  END IF;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: abandoned_carts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.abandoned_carts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    user_id uuid,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    total_price numeric(14,2) DEFAULT 0 NOT NULL,
    recover_token uuid DEFAULT gen_random_uuid() NOT NULL,
    reminder_1_at timestamp with time zone,
    reminder_2_at timestamp with time zone,
    reminder_3_at timestamp with time zone,
    recovered_at timestamp with time zone,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: acc_doc_sequences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.acc_doc_sequences (
    doc_type text NOT NULL,
    prefix text NOT NULL,
    year integer NOT NULL,
    last_number integer DEFAULT 0 NOT NULL
);


--
-- Name: acc_doc_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.acc_doc_types (
    code text NOT NULL,
    name text NOT NULL,
    direction text NOT NULL,
    sort_order integer DEFAULT 0,
    CONSTRAINT acc_doc_types_direction_check CHECK ((direction = ANY (ARRAY['in'::text, 'out'::text, 'both'::text, 'none'::text])))
);


--
-- Name: acc_document_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.acc_document_lines (
    id integer NOT NULL,
    document_id uuid NOT NULL,
    sku text NOT NULL,
    qty numeric(12,3) NOT NULL,
    price numeric(12,2) NOT NULL,
    cost_price numeric(12,2),
    amount numeric(14,2) GENERATED ALWAYS AS ((qty * price)) STORED,
    warehouse_id integer,
    fulfillment_type text DEFAULT 'own'::text NOT NULL,
    supplier_id integer,
    sort_order integer DEFAULT 0,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    uom_code text,
    uom_factor numeric(14,6) DEFAULT 1 NOT NULL,
    qty_in_base numeric(14,6) GENERATED ALWAYS AS ((qty * uom_factor)) STORED,
    qty_actual numeric(12,3),
    qty_system numeric(12,3),
    exchange_rate numeric(14,6) DEFAULT 1 NOT NULL,
    price_uah numeric(12,2) GENERATED ALWAYS AS ((price * exchange_rate)) STORED,
    po_line_id bigint,
    manual_reason text,
    overreceipt_reason text,
    original_qty numeric(12,3),
    adjusted_qty numeric(12,3),
    is_bonus boolean DEFAULT false NOT NULL,
    CONSTRAINT acc_document_lines_cost_price_check CHECK ((cost_price >= (0)::numeric)),
    CONSTRAINT acc_document_lines_fulfillment_type_check CHECK ((fulfillment_type = ANY (ARRAY['own'::text, 'dropship'::text]))),
    CONSTRAINT acc_document_lines_price_check CHECK ((price >= (0)::numeric)),
    CONSTRAINT acc_document_lines_qty_nonzero CHECK ((qty <> (0)::numeric))
);


--
-- Name: acc_document_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.acc_document_lines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: acc_document_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.acc_document_lines_id_seq OWNED BY public.acc_document_lines.id;


--
-- Name: acc_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.acc_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    doc_type text NOT NULL,
    doc_number text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    warehouse_id integer,
    warehouse_to_id integer,
    supplier_id integer,
    order_id uuid,
    counterparty text,
    total_amount numeric(14,2) DEFAULT 0 NOT NULL,
    total_cost numeric(14,2) DEFAULT 0 NOT NULL,
    tracking_number text,
    expected_date timestamp with time zone,
    doc_date timestamp with time zone DEFAULT now() NOT NULL,
    notes text,
    confirmed_at timestamp with time zone,
    confirmed_by text,
    cancelled_at timestamp with time zone,
    cancelled_by text,
    cancel_reason text,
    created_at timestamp with time zone DEFAULT now(),
    created_by text,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    channel_code text,
    marketplace_order_id uuid,
    customer_id uuid,
    currency text DEFAULT 'UAH'::text,
    exchange_rate numeric(14,6) DEFAULT 1 NOT NULL,
    reversal_of uuid,
    parent_doc_id uuid,
    procurement_status text,
    supplier_invoice_number text,
    supplier_invoice_date date,
    supplier_invoice_amount numeric(18,4),
    landed_cost_method text,
    landed_cost_total numeric(18,4),
    po_status text,
    email_sent_at timestamp with time zone,
    contract_id uuid,
    supplier_contract_id uuid,
    CONSTRAINT acc_documents_landed_cost_method_check CHECK ((landed_cost_method = ANY (ARRAY['by_cost'::text, 'by_qty'::text, 'equal'::text]))),
    CONSTRAINT acc_documents_po_status_check CHECK ((po_status = ANY (ARRAY['draft'::text, 'sent'::text, 'confirmed_by_supplier'::text, 'partially_received'::text, 'received'::text, 'closed'::text, 'cancelled'::text]))),
    CONSTRAINT acc_documents_procurement_status_check CHECK (((procurement_status IS NULL) OR (procurement_status = ANY (ARRAY['draft'::text, 'ordered'::text, 'sent'::text, 'confirmed_by_supplier'::text, 'partially_received'::text, 'received'::text, 'invoiced'::text, 'paid'::text, 'cancelled'::text, 'closed'::text])))),
    CONSTRAINT acc_documents_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'confirmed'::text, 'cancelled'::text]))),
    CONSTRAINT transfer_needs_destination CHECK (((doc_type <> 'transfer'::text) OR (warehouse_to_id IS NOT NULL))),
    CONSTRAINT transfer_warehouses_differ CHECK (((warehouse_to_id IS NULL) OR (warehouse_id <> warehouse_to_id)))
);


--
-- Name: COLUMN acc_documents.tracking_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.acc_documents.tracking_number IS 'ТТН посилки для РН (sale): проводимо цю накладну, коли доставлено саме її посилку (Варіант 3).';


--
-- Name: acc_expense_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.acc_expense_categories (
    code text NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0
);


--
-- Name: acc_expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.acc_expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category text NOT NULL,
    sub_category text,
    amount numeric(14,2) NOT NULL,
    description text,
    expense_date timestamp with time zone DEFAULT now() NOT NULL,
    payment_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    created_by text,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT acc_expenses_amount_check CHECK ((amount > (0)::numeric))
);


--
-- Name: acc_payment_methods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.acc_payment_methods (
    code text NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0
);


--
-- Name: acc_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.acc_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_type text NOT NULL,
    payment_method text NOT NULL,
    counterparty text,
    order_id uuid,
    supplier_id integer,
    document_id uuid,
    amount numeric(14,2) NOT NULL,
    currency text DEFAULT 'UAH'::text NOT NULL,
    exchange_rate numeric(10,4) DEFAULT 1 NOT NULL,
    amount_uah numeric(14,2) GENERATED ALWAYS AS ((amount * exchange_rate)) STORED,
    payment_date timestamp with time zone DEFAULT now() NOT NULL,
    description text,
    status text DEFAULT 'confirmed'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    created_by text,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT acc_payments_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT acc_payments_payment_type_check CHECK ((payment_type = ANY (ARRAY['incoming'::text, 'outgoing'::text]))),
    CONSTRAINT acc_payments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'cancelled'::text])))
);


--
-- Name: acc_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.acc_periods (
    period date NOT NULL,
    closed_at timestamp with time zone,
    closed_by text
);


--
-- Name: product_characteristics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_characteristics (
    id integer NOT NULL,
    product_sku text NOT NULL,
    label text NOT NULL,
    value text NOT NULL,
    sort_order integer DEFAULT 0
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id integer NOT NULL,
    sku text NOT NULL,
    name text NOT NULL,
    brand text NOT NULL,
    category_slug text,
    product_type text,
    color text,
    volume text,
    pack_qty integer DEFAULT 1 NOT NULL,
    min_order integer DEFAULT 1 NOT NULL,
    description text,
    image text,
    nl1 text,
    nl2 text,
    bc text DEFAULT '#4A6080'::text,
    ac text DEFAULT '#2A4060'::text,
    img_type text DEFAULT 'tube'::text,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    supplier_sku text,
    description_ru text,
    description_full text,
    description_full_ru text,
    base_uom text DEFAULT 'pcs'::text,
    sale_uom text,
    purchase_uom text,
    purchase_uom_factor numeric(14,6) DEFAULT 1 NOT NULL,
    min_price numeric(12,2),
    purchase_ratio numeric(18,6) DEFAULT 1 NOT NULL,
    sale_ratio numeric(18,6) DEFAULT 1 NOT NULL,
    keywords text,
    is_hit boolean DEFAULT false,
    is_new boolean DEFAULT false,
    name_ru text,
    keywords_ru text,
    prom_portal_url text,
    prom_markup_pct numeric,
    on_rozetka boolean DEFAULT true,
    on_prom boolean DEFAULT true,
    rozetka_markup_pct numeric(5,2),
    rozetka_name text,
    slug text,
    rozetka_smart boolean DEFAULT false NOT NULL,
    description_mp text,
    description_mp_ru text,
    variant_main_sku text,
    variant_canonical boolean DEFAULT false NOT NULL,
    on_epicentr boolean DEFAULT false NOT NULL,
    epicentr_markup_pct numeric(6,2),
    gtin text,
    CONSTRAINT products_gtin_format CHECK (((gtin IS NULL) OR (gtin ~ '^[0-9]{8}$'::text) OR (gtin ~ '^[0-9]{12,14}$'::text)))
);


--
-- Name: COLUMN products.description_mp; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.description_mp IS 'Опис для фідів маркетплейсів (UA), 700-900 знаків, без згадок магазину/доставки. Порожній — фід бере description_full.';


--
-- Name: COLUMN products.description_mp_ru; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.description_mp_ru IS 'Те саме російською (переклад description_mp).';


--
-- Name: COLUMN products.gtin; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.gtin IS 'GTIN/EAN штрихкод (8, 12, 13 або 14 цифр) — фіди Merchant Center / OpenAI';


--
-- Name: admin_products_list; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.admin_products_list WITH (security_invoker='true') AS
 SELECT p.id,
    p.sku,
    p.name,
    p.name_ru,
    p.brand,
    p.category_slug,
    p.volume,
    p.image,
    p.is_active,
    p.is_hit,
    p.is_new,
    p.sort_order,
    p.updated_at,
    COALESCE(length(p.description_full), 0) AS description_full_len,
    COALESCE(length(p.description_full_ru), 0) AS description_full_ru_len,
    ((p.description_ru IS NOT NULL) AND (p.description_ru <> ''::text)) AS has_description_ru,
    ((p.keywords IS NOT NULL) AND (p.keywords <> ''::text)) AS has_keywords,
    (COALESCE(c.cnt, (0)::bigint))::integer AS characteristics_count
   FROM (public.products p
     LEFT JOIN ( SELECT product_characteristics.product_sku,
            count(*) AS cnt
           FROM public.product_characteristics
          GROUP BY product_characteristics.product_sku) c ON ((c.product_sku = p.sku)));


--
-- Name: VIEW admin_products_list; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.admin_products_list IS 'Список товарів для адмінки без текстів описів: довжини/наявність замість самих текстів, кількість характеристик.';


--
-- Name: ads_conversions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ads_conversions (
    order_id uuid NOT NULL,
    order_number integer,
    gclid text NOT NULL,
    conversion_action text NOT NULL,
    value numeric(14,2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'UAH'::text NOT NULL,
    conversion_time timestamp with time zone NOT NULL,
    uploaded_at timestamp with time zone,
    retracted_at timestamp with time zone,
    error text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ads_spend; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ads_spend (
    date date NOT NULL,
    campaign_id bigint NOT NULL,
    campaign_name text NOT NULL,
    channel_type text,
    cost_micros bigint DEFAULT 0 NOT NULL,
    clicks integer DEFAULT 0 NOT NULL,
    impressions integer DEFAULT 0 NOT NULL,
    conversions numeric(12,2) DEFAULT 0 NOT NULL,
    conv_value numeric(14,2) DEFAULT 0 NOT NULL,
    currency text DEFAULT 'UAH'::text NOT NULL,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_agent_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_agent_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent text NOT NULL,
    input jsonb DEFAULT '{}'::jsonb NOT NULL,
    output jsonb,
    model text NOT NULL,
    cost_usd numeric(10,4) DEFAULT 0 NOT NULL,
    input_tokens integer DEFAULT 0 NOT NULL,
    output_tokens integer DEFAULT 0 NOT NULL,
    tool_calls integer DEFAULT 0 NOT NULL,
    duration_ms integer,
    error text,
    outcome text,
    outcome_ref text,
    outcome_at timestamp with time zone,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_bot_hits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_bot_hits (
    day date NOT NULL,
    bot text NOT NULL,
    section text NOT NULL,
    hits integer DEFAULT 0 NOT NULL
);


--
-- Name: ai_referrals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_referrals (
    day date NOT NULL,
    source text NOT NULL,
    landing_path text NOT NULL,
    hits integer DEFAULT 0 NOT NULL
);


--
-- Name: alert_throttle; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alert_throttle (
    title text NOT NULL,
    last_sent_at timestamp with time zone NOT NULL
);


--
-- Name: TABLE alert_throttle; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.alert_throttle IS 'Час останнього Telegram-алерту по кожному заголовку (lib/alert.ts): не частіше 1 разу на 30 хв.';


--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    key text NOT NULL,
    value text NOT NULL
);


--
-- Name: customer_contracts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_contracts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contract_number text NOT NULL,
    customer_id text NOT NULL,
    customer_name text,
    credit_days integer DEFAULT 0 NOT NULL,
    credit_limit numeric(18,4) DEFAULT 0 NOT NULL,
    discount_pct numeric(5,2) DEFAULT 0 NOT NULL,
    allow_promo boolean DEFAULT false NOT NULL,
    payment_terms text,
    price_type text,
    currency text DEFAULT 'UAH'::text NOT NULL,
    start_date date NOT NULL,
    end_date date,
    status text DEFAULT 'active'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    created_by text,
    updated_at timestamp with time zone DEFAULT now(),
    is_auto boolean DEFAULT false,
    CONSTRAINT customer_contracts_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text, 'closed'::text])))
);


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text DEFAULT 'retail'::text NOT NULL,
    price_tier text DEFAULT 'retail'::text NOT NULL,
    name text NOT NULL,
    company text,
    legal_name text,
    tax_number text,
    phone text,
    email text,
    city text,
    address text,
    credit_limit numeric(14,2),
    payment_terms_days integer,
    discount_pct numeric(5,2),
    commission_pct numeric(5,2),
    partner_code text,
    auth_user_id uuid,
    orders_count integer DEFAULT 0 NOT NULL,
    total_revenue numeric(14,2) DEFAULT 0 NOT NULL,
    last_order_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    price_list_id integer,
    balance numeric(14,2) DEFAULT 0 NOT NULL,
    balance_held numeric(14,2) DEFAULT 0 NOT NULL,
    customer_number integer NOT NULL,
    legal_address text,
    bank_name text,
    bank_iban text,
    bank_mfo text,
    CONSTRAINT customers_price_tier_check CHECK ((price_tier = ANY (ARRAY['retail'::text, 'wholesale'::text, 'drop'::text]))),
    CONSTRAINT customers_type_check CHECK ((type = ANY (ARRAY['retail'::text, 'wholesale'::text, 'dropship_partner'::text, 'b2b'::text])))
);


--
-- Name: money_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.money_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    txn_id uuid NOT NULL,
    account_type text NOT NULL,
    counterparty_id text,
    contract_id uuid,
    amount numeric(18,4) NOT NULL,
    currency text DEFAULT 'UAH'::text NOT NULL,
    rate numeric(18,6) DEFAULT 1 NOT NULL,
    doc_id uuid,
    doc_type text,
    order_id uuid,
    description text,
    idempotency_key text,
    business_date date NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    created_by text,
    meta jsonb DEFAULT '{}'::jsonb,
    supplier_contract_id uuid,
    CONSTRAINT money_entries_account_type_check CHECK ((account_type = ANY (ARRAY['customer'::text, 'supplier'::text, 'partner'::text, 'cash'::text, 'bank'::text, 'acquiring'::text, 'novapay'::text, 'advance'::text, 'inventory_asset'::text, 'inventory_transit'::text, 'revenue'::text, 'cogs'::text, 'variance'::text, 'rounding'::text, 'correction'::text, 'logistics'::text, 'loading'::text, 'customs'::text, 'packaging'::text, 'acquiring_fee'::text, 'marketplace_fee'::text, 'marketplace_balance'::text, 'rent'::text, 'salary'::text, 'marketing'::text, 'opex'::text, 'taxes'::text, 'owner'::text, 'bad_debt'::text])))
);


--
-- Name: ar_aging; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.ar_aging AS
 WITH bal AS (
         SELECT money_entries.counterparty_id AS customer_id,
            sum(money_entries.amount) AS balance
           FROM public.money_entries
          WHERE ((money_entries.account_type = 'customer'::text) AND (money_entries.counterparty_id IS NOT NULL) AND (money_entries.counterparty_id !~ '^(np:|mp:|guest$|order:)'::text))
          GROUP BY money_entries.counterparty_id
         HAVING (sum(money_entries.amount) > 0.01)
        ), last_shipment AS (
         SELECT money_entries.counterparty_id AS customer_id,
            max(money_entries.business_date) AS last_ship_date
           FROM public.money_entries
          WHERE ((money_entries.account_type = 'customer'::text) AND (money_entries.doc_type = 'sale'::text) AND (money_entries.amount > (0)::numeric))
          GROUP BY money_entries.counterparty_id
        ), contract AS (
         SELECT DISTINCT ON (customer_contracts.customer_id) customer_contracts.customer_id,
            customer_contracts.id,
            customer_contracts.contract_number,
            customer_contracts.customer_name,
            customer_contracts.credit_days,
            customer_contracts.credit_limit
           FROM public.customer_contracts
          ORDER BY customer_contracts.customer_id, (customer_contracts.status = 'active'::text) DESC, customer_contracts.created_at DESC
        ), x AS (
         SELECT c.id AS contract_id,
            b.customer_id,
            COALESCE(NULLIF(cu.company, ''::text), NULLIF(cu.legal_name, ''::text), cu.name, c.customer_name) AS customer_name,
            c.contract_number,
            COALESCE(c.credit_days, 0) AS credit_days,
            COALESCE(c.credit_limit, (0)::numeric) AS credit_limit,
            b.balance,
            ls.last_ship_date,
            (CURRENT_DATE - ls.last_ship_date) AS days_since_shipment
           FROM (((bal b
             LEFT JOIN last_shipment ls ON ((ls.customer_id = b.customer_id)))
             LEFT JOIN contract c ON ((c.customer_id = b.customer_id)))
             LEFT JOIN public.customers cu ON (((cu.id)::text = b.customer_id)))
        )
 SELECT contract_id,
    customer_id,
    customer_name,
    contract_number,
    credit_days,
    credit_limit,
    balance,
    last_ship_date,
    days_since_shipment,
    GREATEST(0, (COALESCE(days_since_shipment, 0) - credit_days)) AS days_overdue,
        CASE
            WHEN (COALESCE(days_since_shipment, 0) <= credit_days) THEN 'current'::text
            WHEN (days_since_shipment <= (credit_days + 30)) THEN '1_30'::text
            WHEN (days_since_shipment <= (credit_days + 60)) THEN '31_60'::text
            WHEN (days_since_shipment <= (credit_days + 90)) THEN '61_90'::text
            ELSE '90_plus'::text
        END AS aging_bucket,
        CASE
            WHEN (credit_limit > (0)::numeric) THEN round(((balance / credit_limit) * (100)::numeric), 1)
            ELSE NULL::numeric
        END AS limit_used_pct
   FROM x;


--
-- Name: ar_balances; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.ar_balances AS
 WITH bal AS (
         SELECT money_entries.counterparty_id AS customer_id,
            sum(money_entries.amount) AS balance,
            count(DISTINCT money_entries.txn_id) AS txn_count
           FROM public.money_entries
          WHERE ((money_entries.account_type = 'customer'::text) AND (money_entries.counterparty_id IS NOT NULL))
          GROUP BY money_entries.counterparty_id
        ), contract AS (
         SELECT DISTINCT ON (customer_contracts.customer_id) customer_contracts.customer_id,
            customer_contracts.id,
            customer_contracts.contract_number,
            customer_contracts.customer_name,
            customer_contracts.credit_days,
            customer_contracts.credit_limit,
            customer_contracts.currency,
            customer_contracts.status
           FROM public.customer_contracts
          ORDER BY customer_contracts.customer_id, (customer_contracts.status = 'active'::text) DESC, customer_contracts.created_at DESC
        )
 SELECT c.id AS contract_id,
    c.contract_number,
    b.customer_id,
    COALESCE(NULLIF(cu.company, ''::text), NULLIF(cu.legal_name, ''::text), cu.name, c.customer_name) AS customer_name,
    COALESCE(c.credit_days, 0) AS credit_days,
    COALESCE(c.credit_limit, (0)::numeric) AS credit_limit,
    COALESCE(c.currency, 'UAH'::text) AS currency,
    COALESCE(c.status, 'none'::text) AS contract_status,
    b.balance,
    b.txn_count
   FROM ((bal b
     LEFT JOIN contract c ON ((c.customer_id = b.customer_id)))
     LEFT JOIN public.customers cu ON (((cu.id)::text = b.customer_id)));


--
-- Name: ar_correction_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ar_correction_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ar_corrections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ar_corrections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    doc_number text NOT NULL,
    correction_type text NOT NULL,
    from_contract_id uuid,
    to_contract_id uuid,
    from_customer_id text,
    to_customer_id text,
    amount numeric(18,4) NOT NULL,
    currency text DEFAULT 'UAH'::text NOT NULL,
    reason text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    txn_id uuid,
    business_date date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    created_by text,
    confirmed_at timestamp with time zone,
    confirmed_by text,
    cancelled_at timestamp with time zone,
    cancelled_by text,
    notes text,
    CONSTRAINT ar_corrections_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT ar_corrections_correction_type_check CHECK ((correction_type = ANY (ARRAY['transfer_client'::text, 'transfer_contract'::text, 'writeoff'::text, 'advance_offset'::text, 'manual'::text]))),
    CONSTRAINT ar_corrections_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'confirmed'::text, 'cancelled'::text])))
);


--
-- Name: ar_transactions; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.ar_transactions WITH (security_invoker='on') AS
 SELECT me.id,
    me.txn_id,
    me.business_date,
    me.counterparty_id AS customer_id,
    me.contract_id,
    cc.contract_number,
    cc.customer_name,
    me.amount,
    me.currency,
    me.doc_type,
    me.doc_id,
    me.order_id,
    me.description,
    me.created_at,
    me.created_by,
        CASE
            WHEN (me.amount > (0)::numeric) THEN 'debit'::text
            ELSE 'credit'::text
        END AS entry_type
   FROM (public.money_entries me
     LEFT JOIN public.customer_contracts cc ON ((cc.id = me.contract_id)))
  WHERE (me.account_type = 'customer'::text);


--
-- Name: blog_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blog_posts (
    id bigint NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    title_ru text,
    description text NOT NULL,
    description_ru text,
    category text DEFAULT 'Поради'::text NOT NULL,
    category_ru text DEFAULT 'Советы'::text,
    read_time integer DEFAULT 5 NOT NULL,
    keywords text[] DEFAULT '{}'::text[] NOT NULL,
    image text,
    content_html text NOT NULL,
    content_html_ru text,
    faq jsonb DEFAULT '[]'::jsonb NOT NULL,
    faq_ru jsonb DEFAULT '[]'::jsonb NOT NULL,
    related_links jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_published boolean DEFAULT false NOT NULL,
    published_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    image_ru text,
    product_skus text[] DEFAULT '{}'::text[] NOT NULL
);


--
-- Name: COLUMN blog_posts.product_skus; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.blog_posts.product_skus IS 'Артикули товарів для блоку «Чим це зробити». Порядок = порядок показу. Ціни й наявність беруться на рендері.';


--
-- Name: blog_posts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.blog_posts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: blog_posts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.blog_posts_id_seq OWNED BY public.blog_posts.id;


--
-- Name: brand_logos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.brand_logos (
    brand_name text NOT NULL,
    logo_url text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    show_on_home boolean DEFAULT false NOT NULL
);


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id integer NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    parent_slug text,
    prom_commission_pct numeric(5,2),
    prom_commission_pct_econom numeric(5,2),
    prom_section_id bigint,
    prom_section_url text,
    rozetka_category_id text,
    prom_markup_pct numeric,
    description text,
    rozetka_commission_pct numeric(5,2),
    rozetka_markup_pct numeric(5,2) DEFAULT 0,
    rozetka_commission_rz_id text,
    rozetka_commission_label text,
    rozetka_category_name text,
    prom_commission_pct_more_sales numeric(6,3),
    prom_commission_pct_turbo numeric(6,3),
    prom_section_name text,
    epicentr_commission_pct numeric(6,2),
    epicentr_markup_pct numeric(6,2),
    epicentr_category_code text
);


--
-- Name: COLUMN categories.prom_section_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.categories.prom_section_id IS 'Prom.ua section/підрозділ ID — точна категорія де показується товар';


--
-- Name: COLUMN categories.prom_section_url; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.categories.prom_section_url IS 'Prom.ua section URL (напр. https://prom.ua/Germetiki)';


--
-- Name: COLUMN categories.rozetka_category_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.categories.rozetka_category_id IS 'Rozetka category ID для майбутнього YML фіду';


--
-- Name: COLUMN categories.epicentr_category_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.categories.epicentr_category_code IS 'Код категорії з дерева категорій Епіцентру (атрибут code у <category> фіда)';


--
-- Name: categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.categories_id_seq OWNED BY public.categories.id;


--
-- Name: category_characteristics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.category_characteristics (
    category_slug text NOT NULL,
    definition_id integer NOT NULL,
    required boolean DEFAULT false NOT NULL,
    default_value text,
    sort_order integer,
    is_filter boolean,
    filter_order integer
);


--
-- Name: category_content; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.category_content (
    slug text NOT NULL,
    lang text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    seo_text text,
    faq jsonb DEFAULT '[]'::jsonb NOT NULL,
    guide jsonb,
    related jsonb DEFAULT '[]'::jsonb NOT NULL,
    blog_slug text,
    source text DEFAULT 'manual'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by text,
    CONSTRAINT category_content_lang_check CHECK ((lang = ANY (ARRAY['uk'::text, 'ru'::text]))),
    CONSTRAINT category_content_source_check CHECK ((source = ANY (ARRAY['seed'::text, 'manual'::text, 'ai'::text])))
);


--
-- Name: characteristic_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.characteristic_definitions (
    id integer NOT NULL,
    label text NOT NULL,
    aliases text[] DEFAULT '{}'::text[] NOT NULL,
    is_multiselect boolean DEFAULT false NOT NULL,
    unit text,
    sort_order integer DEFAULT 500 NOT NULL,
    kind text DEFAULT 'text'::text NOT NULL,
    is_filter boolean DEFAULT false NOT NULL,
    CONSTRAINT characteristic_definitions_kind_check CHECK ((kind = ANY (ARRAY['enum'::text, 'number'::text, 'text'::text])))
);


--
-- Name: characteristic_definitions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.characteristic_definitions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: characteristic_definitions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.characteristic_definitions_id_seq OWNED BY public.characteristic_definitions.id;


--
-- Name: characteristic_values; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.characteristic_values (
    id integer NOT NULL,
    definition_id integer NOT NULL,
    category_slugs text[] DEFAULT '{}'::text[] NOT NULL,
    value text NOT NULL,
    aliases text[] DEFAULT '{}'::text[] NOT NULL,
    match_patterns text[] DEFAULT '{}'::text[] NOT NULL,
    sort_order integer DEFAULT 500 NOT NULL
);


--
-- Name: characteristic_values_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.characteristic_values_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: characteristic_values_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.characteristic_values_id_seq OWNED BY public.characteristic_values.id;


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT chat_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])))
);


--
-- Name: chat_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    visitor_id text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    last_message_at timestamp with time zone DEFAULT now(),
    unread_count integer DEFAULT 0 NOT NULL,
    ai_enabled boolean DEFAULT true NOT NULL
);


--
-- Name: counterparty_balances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.counterparty_balances (
    counterparty_id text NOT NULL,
    account_type text NOT NULL,
    currency text DEFAULT 'UAH'::text NOT NULL,
    balance numeric(18,4) DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: currencies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.currencies (
    code text NOT NULL,
    name text NOT NULL,
    symbol text NOT NULL,
    is_base boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: customer_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    event text NOT NULL,
    channel text,
    phone text NOT NULL,
    body text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    provider text,
    provider_message_id text,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone
);


--
-- Name: TABLE customer_notifications; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.customer_notifications IS 'Сповіщення покупцю про рух замовлення. UNIQUE(order_id,event) гарантує «одна подія — одне повідомлення».';


--
-- Name: customer_price_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_price_rules (
    id integer NOT NULL,
    customer_id uuid NOT NULL,
    sku text,
    category_slug text,
    price_list_id integer,
    price_override numeric(12,2),
    discount_pct numeric(5,2),
    valid_from timestamp with time zone,
    valid_until timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT customer_price_rules_discount_pct_check CHECK (((discount_pct >= (0)::numeric) AND (discount_pct <= (100)::numeric))),
    CONSTRAINT customer_price_rules_price_override_check CHECK ((price_override >= (0)::numeric)),
    CONSTRAINT one_rule_type CHECK ((((((price_list_id IS NOT NULL))::integer + ((price_override IS NOT NULL))::integer) + ((discount_pct IS NOT NULL))::integer) = 1))
);


--
-- Name: customer_price_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.customer_price_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: customer_price_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.customer_price_rules_id_seq OWNED BY public.customer_price_rules.id;


--
-- Name: customers_customer_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.customers_customer_number_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: customers_customer_number_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.customers_customer_number_seq OWNED BY public.customers.customer_number;


--
-- Name: debt_adjustment_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.debt_adjustment_lines (
    id bigint NOT NULL,
    document_id uuid NOT NULL,
    line_no integer NOT NULL,
    op text NOT NULL,
    debit_account text NOT NULL,
    debit_party text,
    debit_order_id uuid,
    credit_account text NOT NULL,
    credit_party text,
    credit_order_id uuid,
    amount numeric(14,2) NOT NULL,
    note text,
    txn_id uuid,
    reversal_txn_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT debt_adjustment_lines_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT debt_adjustment_lines_credit_account_check CHECK ((credit_account = ANY (ARRAY['customer'::text, 'supplier'::text, 'partner'::text, 'correction'::text, 'bad_debt'::text]))),
    CONSTRAINT debt_adjustment_lines_debit_account_check CHECK ((debit_account = ANY (ARRAY['customer'::text, 'supplier'::text, 'partner'::text, 'correction'::text, 'bad_debt'::text]))),
    CONSTRAINT debt_adjustment_lines_op_check CHECK ((op = ANY (ARRAY['transfer'::text, 'offset'::text, 'write_off'::text])))
);


--
-- Name: debt_adjustment_lines_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.debt_adjustment_lines_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: debt_adjustment_lines_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.debt_adjustment_lines_id_seq OWNED BY public.debt_adjustment_lines.id;


--
-- Name: exchange_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exchange_rates (
    id integer NOT NULL,
    currency text NOT NULL,
    rate numeric(14,6) NOT NULL,
    rate_date date NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    CONSTRAINT exchange_rates_rate_check CHECK ((rate > (0)::numeric)),
    CONSTRAINT exchange_rates_source_check CHECK ((source = ANY (ARRAY['nbu'::text, 'privatbank'::text, 'manual'::text])))
);


--
-- Name: exchange_rates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.exchange_rates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exchange_rates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.exchange_rates_id_seq OWNED BY public.exchange_rates.id;


--
-- Name: expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    expense_type text NOT NULL,
    description text NOT NULL,
    amount numeric(18,4) NOT NULL,
    currency text DEFAULT 'UAH'::text NOT NULL,
    payment_method text DEFAULT 'bank'::text NOT NULL,
    counterparty text,
    doc_ref text,
    source text,
    source_id uuid,
    txn_id uuid,
    business_date date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    created_by text,
    CONSTRAINT expenses_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT expenses_expense_type_check CHECK ((expense_type = ANY (ARRAY['logistics'::text, 'loading'::text, 'customs'::text, 'packaging'::text, 'acquiring_fee'::text, 'marketplace_fee'::text, 'rent'::text, 'salary'::text, 'marketing'::text, 'opex'::text, 'taxes'::text, 'other'::text]))),
    CONSTRAINT expenses_payment_method_check CHECK ((payment_method = ANY (ARRAY['bank'::text, 'cash'::text, 'acquiring'::text, 'novapay'::text])))
);


--
-- Name: fulfillment_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fulfillment_rules (
    id integer NOT NULL,
    name text NOT NULL,
    sku text,
    category_slug text,
    channel_code text,
    customer_type text,
    region text,
    warehouse_id integer NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: fulfillment_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.fulfillment_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fulfillment_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.fulfillment_rules_id_seq OWNED BY public.fulfillment_rules.id;


--
-- Name: gsc_daily; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gsc_daily (
    date date NOT NULL,
    page_path text NOT NULL,
    clicks integer DEFAULT 0 NOT NULL,
    impressions integer DEFAULT 0 NOT NULL,
    "position" numeric(6,2) DEFAULT 0 NOT NULL
);


--
-- Name: landed_cost_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.landed_cost_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    cost_type text NOT NULL,
    description text,
    amount numeric(18,4) NOT NULL,
    distributed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT landed_cost_lines_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT landed_cost_lines_cost_type_check CHECK ((cost_type = ANY (ARRAY['delivery'::text, 'loading'::text, 'customs'::text, 'packaging'::text, 'broker'::text, 'other'::text])))
);


--
-- Name: mail_oauth_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mail_oauth_tokens (
    id integer DEFAULT 1 NOT NULL,
    access_token text NOT NULL,
    refresh_token text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    account_id text,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT single_row CHECK ((id = 1))
);


--
-- Name: mail_read_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mail_read_messages (
    message_id text NOT NULL,
    read_at timestamp with time zone DEFAULT now()
);


--
-- Name: mail_register_imports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mail_register_imports (
    message_id text NOT NULL,
    source text NOT NULL,
    kind text NOT NULL,
    register_no text,
    subject text,
    received_at timestamp with time zone,
    status text NOT NULL,
    result jsonb,
    error text,
    processed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mail_register_imports_source_check CHECK ((source = ANY (ARRAY['novapay'::text, 'rozetkapay'::text]))),
    CONSTRAINT mail_register_imports_status_check CHECK ((status = ANY (ARRAY['done'::text, 'skipped'::text, 'no-doc'::text, 'error'::text])))
);


--
-- Name: TABLE mail_register_imports; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.mail_register_imports IS 'Імпорт реєстрів виплат (НоваПей/RozetkaPay) з пошти: що вже оброблено і з яким результатом';


--
-- Name: market_price_checks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.market_price_checks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sku text NOT NULL,
    product_name text NOT NULL,
    our_price numeric,
    rozetka_min numeric,
    prom_min numeric,
    market_min numeric,
    market_avg numeric,
    match_count integer DEFAULT 0,
    delta_pct numeric,
    status text DEFAULT 'not_checked'::text,
    results jsonb DEFAULT '[]'::jsonb,
    checked_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE market_price_checks; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.market_price_checks IS 'Cached market price comparison per product';


--
-- Name: COLUMN market_price_checks.delta_pct; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.market_price_checks.delta_pct IS '(our_price - market_min) / market_min * 100';


--
-- Name: COLUMN market_price_checks.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.market_price_checks.status IS 'ok | warning | expensive | cheap | not_found | not_checked';


--
-- Name: COLUMN market_price_checks.results; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.market_price_checks.results IS 'Array of {source,title,price,url,confidence}';


--
-- Name: marketplace_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_accounts (
    id integer NOT NULL,
    channel_code text NOT NULL,
    platform text NOT NULL,
    name text NOT NULL,
    shop_id text,
    is_active boolean DEFAULT true NOT NULL,
    api_credentials jsonb DEFAULT '{}'::jsonb NOT NULL,
    feed_url text,
    feed_token text,
    feed_format text DEFAULT 'yml'::text,
    commission_pct numeric(5,2) DEFAULT 0,
    last_orders_sync_at timestamp with time zone,
    last_stock_sync_at timestamp with time zone,
    last_price_sync_at timestamp with time zone,
    last_products_sync_at timestamp with time zone,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    price_list_id integer,
    CONSTRAINT marketplace_accounts_feed_format_check CHECK ((feed_format = ANY (ARRAY['yml'::text, 'xml'::text, 'csv'::text])))
);


--
-- Name: marketplace_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.marketplace_accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: marketplace_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.marketplace_accounts_id_seq OWNED BY public.marketplace_accounts.id;


--
-- Name: marketplace_chat_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_chat_drafts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mp text NOT NULL,
    chat_id text NOT NULL,
    last_incoming_at text NOT NULL,
    category text NOT NULL,
    summary text NOT NULL,
    draft text NOT NULL,
    needs_human boolean DEFAULT false NOT NULL,
    reason text,
    model text NOT NULL,
    cost_usd numeric(10,4) DEFAULT 0 NOT NULL,
    input_tokens integer DEFAULT 0 NOT NULL,
    output_tokens integer DEFAULT 0 NOT NULL,
    tool_calls integer DEFAULT 0 NOT NULL,
    outcome text,
    sent_text text,
    outcome_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT marketplace_chat_drafts_mp_check CHECK ((mp = ANY (ARRAY['rozetka'::text, 'prom'::text]))),
    CONSTRAINT marketplace_chat_drafts_outcome_check CHECK ((outcome = ANY (ARRAY['sent_as_is'::text, 'edited'::text, 'discarded'::text])))
);


--
-- Name: marketplace_chat_seen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_chat_seen (
    mp text NOT NULL,
    chat_id text NOT NULL,
    seen_update text,
    seen_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT marketplace_chat_seen_mp_check CHECK ((mp = ANY (ARRAY['rozetka'::text, 'prom'::text])))
);


--
-- Name: marketplace_listings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_listings (
    id integer NOT NULL,
    marketplace_id integer NOT NULL,
    sku text NOT NULL,
    external_product_id text,
    external_sku text,
    external_category_id text,
    external_url text,
    price_strategy text DEFAULT 'standard'::text NOT NULL,
    price_override numeric(12,2),
    price_formula jsonb,
    qty_limit integer,
    qty_buffer integer DEFAULT 0 NOT NULL,
    is_listed boolean DEFAULT true NOT NULL,
    listing_status text DEFAULT 'active'::text NOT NULL,
    listing_status_reason text,
    needs_sync boolean DEFAULT false NOT NULL,
    last_synced_at timestamp with time zone,
    last_sync_error text,
    last_synced_qty integer,
    last_synced_price numeric(12,2),
    created_at timestamp with time zone DEFAULT now(),
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT marketplace_listings_listing_status_check CHECK ((listing_status = ANY (ARRAY['active'::text, 'pending'::text, 'rejected'::text, 'paused'::text, 'unlisted'::text]))),
    CONSTRAINT marketplace_listings_price_strategy_check CHECK ((price_strategy = ANY (ARRAY['standard'::text, 'override'::text, 'formula'::text])))
);


--
-- Name: marketplace_listings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.marketplace_listings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: marketplace_listings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.marketplace_listings_id_seq OWNED BY public.marketplace_listings.id;


--
-- Name: marketplace_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    marketplace_id integer NOT NULL,
    external_order_id text NOT NULL,
    external_order_num text,
    our_order_id uuid,
    buyer_name text,
    buyer_phone text,
    buyer_email text,
    delivery_address text,
    delivery_city text,
    tracking_number text,
    total_amount numeric(14,2),
    commission_pct numeric(5,2),
    commission_amount numeric(14,2) GENERATED ALWAYS AS (
CASE
    WHEN ((commission_pct IS NOT NULL) AND (total_amount IS NOT NULL)) THEN round(((total_amount * commission_pct) / (100)::numeric), 2)
    ELSE NULL::numeric
END) STORED,
    status_external text NOT NULL,
    status_mapped text,
    raw_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    processing_error text
);


--
-- Name: marketplace_refunds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_refunds (
    marketplace text NOT NULL,
    refund_id text NOT NULL,
    mp_order_id bigint,
    order_id uuid,
    status_code text,
    status_title text,
    reason_title text,
    item_name text,
    ttn text,
    opened_at timestamp with time zone,
    raw jsonb,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: marketplace_status_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_status_map (
    marketplace_id integer NOT NULL,
    external_status text NOT NULL,
    our_status text NOT NULL,
    CONSTRAINT marketplace_status_map_our_status_check CHECK ((our_status = ANY (ARRAY['new'::text, 'confirmed'::text, 'shipped'::text, 'delivered'::text, 'cancelled'::text])))
);


--
-- Name: marketplace_sync_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_sync_log (
    id integer NOT NULL,
    marketplace_id integer NOT NULL,
    sync_type text NOT NULL,
    direction text NOT NULL,
    triggered_by text DEFAULT 'cron'::text NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    records_total integer DEFAULT 0 NOT NULL,
    records_ok integer DEFAULT 0 NOT NULL,
    records_error integer DEFAULT 0 NOT NULL,
    records_skipped integer DEFAULT 0 NOT NULL,
    error_details text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    CONSTRAINT marketplace_sync_log_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text]))),
    CONSTRAINT marketplace_sync_log_status_check CHECK ((status = ANY (ARRAY['running'::text, 'success'::text, 'error'::text, 'partial'::text]))),
    CONSTRAINT marketplace_sync_log_triggered_by_check CHECK ((triggered_by = ANY (ARRAY['cron'::text, 'webhook'::text, 'manual'::text])))
);


--
-- Name: marketplace_sync_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.marketplace_sync_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: marketplace_sync_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.marketplace_sync_log_id_seq OWNED BY public.marketplace_sync_log.id;


--
-- Name: marketplace_sync_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_sync_queue (
    id bigint NOT NULL,
    listing_id integer NOT NULL,
    sku text NOT NULL,
    marketplace_id integer NOT NULL,
    sync_type text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 5 NOT NULL,
    retry_after timestamp with time zone,
    queued_at timestamp with time zone DEFAULT now() NOT NULL,
    last_attempt_at timestamp with time zone,
    error_message text,
    CONSTRAINT marketplace_sync_queue_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'done'::text, 'error'::text]))),
    CONSTRAINT marketplace_sync_queue_sync_type_check CHECK ((sync_type = ANY (ARRAY['stock'::text, 'price'::text, 'product_update'::text, 'listing_status'::text])))
);


--
-- Name: marketplace_sync_queue_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.marketplace_sync_queue_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: marketplace_sync_queue_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.marketplace_sync_queue_id_seq OWNED BY public.marketplace_sync_queue.id;


--
-- Name: mono_bank_txns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mono_bank_txns (
    id text NOT NULL,
    account text,
    txn_time timestamp with time zone,
    amount numeric NOT NULL,
    comment text,
    description text,
    counter_name text,
    counter_edrpou text,
    counter_iban text,
    status text DEFAULT 'unmatched'::text NOT NULL,
    matched_order_id uuid,
    order_payment_id uuid,
    raw jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    direction text DEFAULT 'in'::text NOT NULL,
    category text,
    txn_id uuid,
    note text,
    posted_at timestamp with time zone,
    posted_by text,
    CONSTRAINT mono_bank_txns_direction_check CHECK ((direction = ANY (ARRAY['in'::text, 'out'::text]))),
    CONSTRAINT mono_bank_txns_status_check CHECK ((status = ANY (ARRAY['matched'::text, 'unmatched'::text, 'acquiring'::text, 'posted'::text, 'ignored'::text])))
);


--
-- Name: novapay_txns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.novapay_txns (
    id text NOT NULL,
    account text,
    txn_date date NOT NULL,
    amount numeric(14,2) NOT NULL,
    direction text NOT NULL,
    counterparty text,
    purpose text,
    code text,
    register_no text,
    kind text DEFAULT 'other'::text NOT NULL,
    status text DEFAULT 'unmatched'::text NOT NULL,
    category text,
    txn_id uuid,
    note text,
    raw jsonb,
    posted_at timestamp with time zone,
    posted_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT novapay_txns_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT novapay_txns_direction_check CHECK ((direction = ANY (ARRAY['in'::text, 'out'::text]))),
    CONSTRAINT novapay_txns_kind_check CHECK ((kind = ANY (ARRAY['cod_payout'::text, 'other_in'::text, 'debit'::text]))),
    CONSTRAINT novapay_txns_status_check CHECK ((status = ANY (ARRAY['posted'::text, 'unmatched'::text, 'ignored'::text])))
);


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppliers (
    id integer NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    source_url text,
    file_format text DEFAULT 'csv'::text NOT NULL,
    sync_interval_h integer DEFAULT 24 NOT NULL,
    last_synced_at timestamp with time zone,
    markup_retail numeric(5,2) DEFAULT 22 NOT NULL,
    markup_wholesale numeric(5,2) DEFAULT 10 NOT NULL,
    markup_drop numeric(5,2) DEFAULT 15 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    col_sku text,
    col_price text,
    col_qty text,
    col_name text,
    min_order_amount numeric(14,2),
    payment_terms text DEFAULT 'prepayment'::text,
    payment_terms_days integer,
    lead_time_days integer,
    return_policy text,
    account_number text,
    contact_person text,
    contact_phone text,
    qty_is_flag boolean DEFAULT false,
    email text,
    contact_name text,
    bank_iban text,
    bank_name text,
    bank_swift text,
    legal_name text,
    edrpou text,
    payment_days integer DEFAULT 0 NOT NULL,
    priority integer DEFAULT 10 NOT NULL,
    contacts jsonb DEFAULT '[]'::jsonb NOT NULL,
    stock_always_available boolean DEFAULT false NOT NULL,
    CONSTRAINT suppliers_payment_terms_check CHECK ((payment_terms = ANY (ARRAY['prepayment'::text, 'credit'::text, 'mixed'::text])))
);


--
-- Name: open_purchase_orders; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.open_purchase_orders WITH (security_invoker='on') AS
 SELECT d.id,
    d.doc_number,
    d.doc_date,
        CASE
            WHEN (d.status = 'draft'::text) THEN 'draft'::text
            ELSE d.procurement_status
        END AS procurement_status,
    d.email_sent_at,
    d.expected_date,
    d.supplier_id,
    s.name AS supplier_name,
    s.email AS supplier_email,
    d.order_id,
    d.total_amount,
    d.total_cost,
    d.notes,
    d.supplier_invoice_number,
    d.supplier_invoice_date,
    d.supplier_invoice_amount,
    d.created_by,
    d.created_at,
    d.meta,
    (EXISTS ( SELECT 1
           FROM public.acc_documents r
          WHERE ((r.parent_doc_id = d.id) AND (r.doc_type = ANY (ARRAY['receipt'::text, 'stock_in'::text])) AND (r.status = 'confirmed'::text)))) AS has_receipt
   FROM (public.acc_documents d
     LEFT JOIN public.suppliers s ON ((s.id = d.supplier_id)))
  WHERE ((d.doc_type = 'purchase_order'::text) AND (d.status = ANY (ARRAY['draft'::text, 'confirmed'::text])) AND (d.reversal_of IS NULL))
  ORDER BY d.doc_date DESC, d.created_at DESC;


--
-- Name: order_edits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_edits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    at timestamp with time zone DEFAULT now() NOT NULL,
    order_id uuid,
    document_id uuid,
    source text NOT NULL,
    edited_by text,
    total_before numeric,
    total_after numeric,
    date_before timestamp with time zone,
    date_after timestamp with time zone,
    items_before jsonb,
    items_after jsonb,
    issues jsonb DEFAULT '[]'::jsonb NOT NULL,
    blocked boolean DEFAULT false NOT NULL
);


--
-- Name: order_number_seq; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_number_seq (
    ym character(4) NOT NULL,
    last_val integer DEFAULT 999 NOT NULL
);


--
-- Name: order_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    amount numeric(12,2) NOT NULL,
    payment_mode text DEFAULT 'cash'::text NOT NULL,
    payment_date date DEFAULT CURRENT_DATE NOT NULL,
    note text,
    reversed boolean DEFAULT false NOT NULL,
    reversed_at timestamp with time zone,
    reversed_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text,
    doc_id uuid,
    CONSTRAINT order_payments_amount_check CHECK ((amount <> (0)::numeric)),
    CONSTRAINT order_payments_payment_mode_check CHECK ((payment_mode = ANY (ARRAY['cash'::text, 'transfer'::text, 'card'::text, 'acquiring'::text, 'adjustment'::text])))
);


--
-- Name: order_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_status_history (
    id bigint NOT NULL,
    order_id uuid NOT NULL,
    status_from text,
    status_to text NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    changed_by text,
    notes text
);


--
-- Name: order_status_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.order_status_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: order_status_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.order_status_history_id_seq OWNED BY public.order_status_history.id;


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    user_id uuid,
    company text,
    contact text NOT NULL,
    phone text NOT NULL,
    email text NOT NULL,
    delivery_type text NOT NULL,
    delivery_subtype text,
    delivery_address text,
    payment_type text NOT NULL,
    comment text,
    items jsonb NOT NULL,
    total_price numeric NOT NULL,
    status text DEFAULT 'new'::text,
    order_number integer NOT NULL,
    tracking_number text,
    delivery_city_ref text,
    delivery_city_name text,
    delivery_warehouse_ref text,
    payment_confirmed boolean DEFAULT false,
    callback_done boolean DEFAULT false,
    channel_code text DEFAULT 'website'::text,
    customer_id uuid,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    utm_content text,
    utm_term text,
    referrer_url text,
    partner_code text,
    promo_id uuid,
    discount_amount numeric(14,2) DEFAULT 0,
    fulfillment_mode text DEFAULT 'supplier'::text,
    telegram_chat_id text,
    tracking_ref text,
    supplier_sent_at timestamp with time zone,
    supplier_confirmed boolean DEFAULT false NOT NULL,
    confirmed_at timestamp with time zone,
    shipped_at timestamp with time zone,
    delivered_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    status_history jsonb DEFAULT '[]'::jsonb,
    prom_order_id bigint,
    prom_data jsonb,
    amount_paid numeric(12,2) DEFAULT 0 NOT NULL,
    payment_due_date date,
    contract_id uuid,
    promo_code text,
    promo_discount numeric,
    rozetka_order_id bigint,
    rozetka_data jsonb,
    carrier_accepted_at timestamp with time zone,
    carrier_status_text text,
    carrier_status_synced_at timestamp with time zone,
    review_token uuid DEFAULT gen_random_uuid(),
    review_request_sent_at timestamp with time zone,
    payment_reference text,
    shipping_supplier_id integer,
    ship_lock timestamp with time zone,
    price_type text,
    discount_pct numeric DEFAULT 0 NOT NULL,
    invoice_as_company boolean DEFAULT false NOT NULL,
    invoice_options jsonb,
    internal_note text,
    flags text[] DEFAULT '{}'::text[] NOT NULL,
    np_delivery_cost numeric,
    np_delivery_payer text,
    mp_refund_status text,
    np_return_ref text,
    np_return_number text,
    np_return_ttn text,
    np_return_created_at timestamp with time zone,
    np_return_tracking jsonb,
    rz_delivery_cost numeric,
    rz_payment_fee numeric,
    rz_delivery_payer text,
    payment_method_code text GENERATED ALWAYS AS (
CASE
    WHEN (payment_type = 'cod'::text) THEN 'cod'::text
    WHEN (((prom_data -> 'payment_data'::text) ->> 'type'::text) = 'evopay'::text) THEN 'prom'::text
    WHEN (((rozetka_data -> 'payment'::text) ->> 'payment_type_title'::text) = ANY (ARRAY['Apple Pay'::text, 'Google Pay'::text])) THEN 'wallet'::text
    WHEN ((payment_type = 'card'::text) OR (((rozetka_data -> 'payment'::text) ->> 'payment_type_title'::text) = 'Банківська картка'::text)) THEN 'card'::text
    WHEN (payment_type = 'invoice'::text) THEN 'invoice'::text
    WHEN (payment_type = 'cash'::text) THEN 'cash'::text
    WHEN (payment_type = 'deferred'::text) THEN 'deferred'::text
    ELSE 'other'::text
END) STORED,
    carrier_delivered_at timestamp with time zone,
    gclid text,
    epicentr_order_id text,
    epicentr_data jsonb,
    review_reminder_sent_at timestamp with time zone,
    CONSTRAINT orders_price_type_check CHECK ((price_type = ANY (ARRAY['retail'::text, 'wholesale'::text, 'drop'::text])))
);


--
-- Name: COLUMN orders.discount_amount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.discount_amount IS 'Сума знижки в грн (снапшот): Σ(price_base − price)·qty на момент застосування.';


--
-- Name: COLUMN orders.shipping_supplier_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.shipping_supplier_id IS 'Фактичний постачальник, який відвантажив дроп-замовлення (обирає менеджер; використовується для віднесення боргу перед постачальником)';


--
-- Name: COLUMN orders.ship_lock; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.ship_lock IS 'Атомарний claim відгрузки: /ship захоплює його UPDATE-ом, паралельний запит отримує 409. Протухає за 2 хв.';


--
-- Name: COLUMN orders.price_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.price_type IS 'Тариф, за яким пораховані позиції замовлення: retail | wholesale | drop';


--
-- Name: COLUMN orders.discount_pct; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.discount_pct IS 'Ручна знижка по замовленню, % (0 = без знижки). Застосована до items[].price.';


--
-- Name: COLUMN orders.invoice_as_company; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.invoice_as_company IS 'Виставляти рахунок на підприємство — реквізити покупця беруться з картки контрагента (customers.legal_name/tax_number/legal_address).';


--
-- Name: COLUMN orders.invoice_options; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.invoice_options IS 'Опції відображення рахунку: show_contact / show_delivery / show_terms. null = дефолти.';


--
-- Name: COLUMN orders.np_return_ref; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.np_return_ref IS 'Ref заявки на повернення в НП (AdditionalService, OrderType=orderCargoReturn)';


--
-- Name: COLUMN orders.np_return_tracking; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.np_return_tracking IS 'Де зараз зворотна посилка: {ttn,status,statusCode,place,arrivedAt,storageUntil,syncedAt}. Пише крон sync-delivery-status, джерело — трекінг НП по накладній CargoReturn.';


--
-- Name: COLUMN orders.rz_delivery_cost; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.rz_delivery_cost IS 'Вартість доставки ROZETKA Доставки (shipping_cost при створенні ЕН), грн';


--
-- Name: COLUMN orders.rz_payment_fee; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.rz_payment_fee IS 'Комісія за переказ післяплати (payment_fee), грн — витрата продавця';


--
-- Name: COLUMN orders.rz_delivery_payer; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.rz_delivery_payer IS 'sender | receiver — хто платить доставку';


--
-- Name: COLUMN orders.payment_method_code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.payment_method_code IS 'Форма оплати одним кодом (cod / prom / wallet / card / invoice / cash / deferred / other). Рахується з payload площадки + payment_type; див. міграцію 099.';


--
-- Name: COLUMN orders.carrier_delivered_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.carrier_delivered_at IS 'Час видачі посилки за даними перевізника (НП). NULL — перевізник часу не дав.';


--
-- Name: COLUMN orders.gclid; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.gclid IS 'Google Click ID з рекламного переходу. Потрібен для вивантаження офлайн-конверсій у Google Ads.';


--
-- Name: COLUMN orders.epicentr_order_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.epicentr_order_id IS 'UUID замовлення в Merchant API Епіцентру; номер для людей — epicentr_data->>''number''';


--
-- Name: COLUMN orders.epicentr_data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.epicentr_data IS 'Сирий payload замовлення з /v4/oms/orders + _commission (знімок розрахунку комісії)';


--
-- Name: orders_order_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.orders_order_number_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: orders_order_number_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.orders_order_number_seq OWNED BY public.orders.order_number;


--
-- Name: partner_balance_reconciliation; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.partner_balance_reconciliation WITH (security_invoker='on') AS
 SELECT c.id AS customer_id,
    c.name,
    c.balance AS balance_direct,
    COALESCE(sum(me.amount), (0)::numeric) AS balance_ledger,
    (c.balance - COALESCE(sum(me.amount), (0)::numeric)) AS drift
   FROM (public.customers c
     LEFT JOIN public.money_entries me ON (((me.counterparty_id = (c.id)::text) AND (me.account_type = 'partner'::text))))
  WHERE (c.type = ANY (ARRAY['dropship_partner'::text, 'wholesale'::text]))
  GROUP BY c.id, c.name, c.balance;


--
-- Name: partner_balance_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.partner_balance_transactions (
    id bigint NOT NULL,
    customer_id uuid NOT NULL,
    tx_type text NOT NULL,
    amount numeric(14,2) NOT NULL,
    balance_after numeric(14,2),
    order_id uuid,
    description text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text,
    external_ref text,
    CONSTRAINT partner_balance_transactions_tx_type_check CHECK ((tx_type = ANY (ARRAY['top_up'::text, 'charge'::text, 'cod_credit'::text, 'np_fee'::text, 'return_refund'::text, 'return_fee'::text, 'payout'::text, 'goods_offset'::text, 'adjustment'::text])))
);


--
-- Name: partner_balance_transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.partner_balance_transactions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: partner_balance_transactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.partner_balance_transactions_id_seq OWNED BY public.partner_balance_transactions.id;


--
-- Name: partner_payout_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.partner_payout_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    amount numeric(14,2) NOT NULL,
    method text DEFAULT 'bank'::text NOT NULL,
    bank_details text,
    status text DEFAULT 'pending'::text NOT NULL,
    notes text,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    processed_by text,
    CONSTRAINT partner_payout_requests_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT partner_payout_requests_method_check CHECK ((method = ANY (ARRAY['bank'::text, 'goods_offset'::text]))),
    CONSTRAINT partner_payout_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'paid'::text, 'rejected'::text])))
);


--
-- Name: pending_card_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pending_card_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    payload jsonb NOT NULL,
    reference text NOT NULL,
    total_price numeric(14,2) NOT NULL,
    email text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: pos_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_sessions (
    id integer NOT NULL,
    terminal_id integer NOT NULL,
    session_number text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    opened_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_at timestamp with time zone,
    opening_cash numeric(12,2) DEFAULT 0 NOT NULL,
    closing_cash numeric(12,2),
    opened_by text,
    closed_by text,
    fiscal_session_id text,
    fiscal_session_data jsonb,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT pos_sessions_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text, 'error'::text])))
);


--
-- Name: pos_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pos_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pos_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pos_sessions_id_seq OWNED BY public.pos_sessions.id;


--
-- Name: pos_terminals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_terminals (
    id integer NOT NULL,
    warehouse_id integer NOT NULL,
    name text NOT NULL,
    fiscal_system text,
    fiscal_id text,
    is_active boolean DEFAULT true NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: pos_terminals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pos_terminals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pos_terminals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pos_terminals_id_seq OWNED BY public.pos_terminals.id;


--
-- Name: price_change_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.price_change_log (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    user_id uuid,
    type text NOT NULL,
    value numeric NOT NULL,
    target text NOT NULL,
    is_promo boolean DEFAULT false,
    comment text,
    revert_at date,
    count integer,
    snapshot jsonb,
    reverted_at timestamp with time zone,
    effective_from timestamp with time zone,
    status text DEFAULT 'applied'::text NOT NULL
);


--
-- Name: price_change_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.price_change_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: price_change_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.price_change_log_id_seq OWNED BY public.price_change_log.id;


--
-- Name: price_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.price_history (
    id bigint NOT NULL,
    sku text NOT NULL,
    price_type text NOT NULL,
    price_old numeric(12,2),
    price_new numeric(12,2) NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    changed_by text,
    source text
);


--
-- Name: price_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.price_history_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: price_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.price_history_id_seq OWNED BY public.price_history.id;


--
-- Name: price_lists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.price_lists (
    id integer NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    currency text DEFAULT 'UAH'::text NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    valid_from timestamp with time zone,
    valid_until timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT price_lists_type_check CHECK ((type = ANY (ARRAY['retail'::text, 'wholesale'::text, 'drop'::text, 'marketplace'::text, 'custom'::text])))
);


--
-- Name: price_lists_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.price_lists_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: price_lists_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.price_lists_id_seq OWNED BY public.price_lists.id;


--
-- Name: pricing_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pricing_rules (
    id bigint NOT NULL,
    marketplace text DEFAULT 'all'::text NOT NULL,
    scope text NOT NULL,
    sku text,
    brand text,
    category_slug text,
    cost_from numeric(12,2),
    cost_to numeric(12,2),
    markup_pct numeric(6,2),
    min_profit_uah numeric(12,2),
    min_price_uah numeric(12,2),
    round_step numeric(6,2),
    exclude_single boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pricing_rules_marketplace_check CHECK ((marketplace = ANY (ARRAY['all'::text, 'rozetka'::text, 'prom'::text]))),
    CONSTRAINT pricing_rules_scope_check CHECK ((scope = ANY (ARRAY['product'::text, 'brand_category'::text, 'category'::text, 'cost_band'::text, 'global'::text]))),
    CONSTRAINT pricing_rules_scope_keys CHECK ((((scope = 'product'::text) AND (sku IS NOT NULL) AND (category_slug IS NULL) AND (brand IS NULL)) OR ((scope = 'brand_category'::text) AND (sku IS NULL) AND (category_slug IS NOT NULL) AND (brand IS NOT NULL)) OR ((scope = 'category'::text) AND (sku IS NULL) AND (category_slug IS NOT NULL) AND (brand IS NULL)) OR ((scope = 'cost_band'::text) AND (sku IS NULL) AND (category_slug IS NULL) AND (brand IS NULL) AND (cost_from IS NOT NULL)) OR ((scope = 'global'::text) AND (sku IS NULL) AND (category_slug IS NULL) AND (brand IS NULL))))
);


--
-- Name: pricing_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pricing_rules_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pricing_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pricing_rules_id_seq OWNED BY public.pricing_rules.id;


--
-- Name: procurement_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.procurement_summary WITH (security_invoker='on') AS
 WITH ordered AS (
         SELECT d.id AS po_id,
            l.sku,
            sum(l.qty) AS ordered_qty,
            avg(l.cost_price) AS avg_cost
           FROM (public.acc_documents d
             JOIN public.acc_document_lines l ON ((l.document_id = d.id)))
          WHERE ((d.doc_type = 'purchase_order'::text) AND (d.status = 'confirmed'::text))
          GROUP BY d.id, l.sku
        ), adjustments AS (
         SELECT d.parent_doc_id AS po_id,
            l.sku,
            COALESCE(sum((l.adjusted_qty - l.original_qty)), (0)::numeric) AS delta_qty
           FROM (public.acc_documents d
             JOIN public.acc_document_lines l ON ((l.document_id = d.id)))
          WHERE ((d.doc_type = 'purchase_order_adjustment'::text) AND (d.status = 'confirmed'::text) AND (d.parent_doc_id IS NOT NULL))
          GROUP BY d.parent_doc_id, l.sku
        ), received AS (
         SELECT d.parent_doc_id AS po_id,
            l.sku,
            sum(l.qty) AS received_qty
           FROM (public.acc_documents d
             JOIN public.acc_document_lines l ON ((l.document_id = d.id)))
          WHERE ((d.doc_type = ANY (ARRAY['receipt'::text, 'stock_in'::text])) AND (d.status = 'confirmed'::text) AND (d.parent_doc_id IS NOT NULL))
          GROUP BY d.parent_doc_id, l.sku
        ), returned AS (
         SELECT d.parent_doc_id AS po_id,
            l.sku,
            sum(l.qty) AS returned_qty
           FROM (public.acc_documents d
             JOIN public.acc_document_lines l ON ((l.document_id = d.id)))
          WHERE ((d.doc_type = 'supplier_return'::text) AND (d.status = 'confirmed'::text) AND (d.parent_doc_id IS NOT NULL))
          GROUP BY d.parent_doc_id, l.sku
        )
 SELECT o.po_id,
    o.sku,
    o.ordered_qty,
    COALESCE(a.delta_qty, (0)::numeric) AS adjustment_delta,
    (o.ordered_qty + COALESCE(a.delta_qty, (0)::numeric)) AS effective_ordered_qty,
    COALESCE(r.received_qty, (0)::numeric) AS received_qty,
    COALESCE(rt.returned_qty, (0)::numeric) AS returned_qty,
    (((o.ordered_qty + COALESCE(a.delta_qty, (0)::numeric)) - COALESCE(r.received_qty, (0)::numeric)) + COALESCE(rt.returned_qty, (0)::numeric)) AS remaining_qty,
    o.avg_cost
   FROM (((ordered o
     LEFT JOIN adjustments a ON (((a.po_id = o.po_id) AND (a.sku = o.sku))))
     LEFT JOIN received r ON (((r.po_id = o.po_id) AND (r.sku = o.sku))))
     LEFT JOIN returned rt ON (((rt.po_id = o.po_id) AND (rt.sku = o.sku))));


--
-- Name: product_characteristics_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_characteristics_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_characteristics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_characteristics_id_seq OWNED BY public.product_characteristics.id;


--
-- Name: product_faq; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_faq (
    id bigint NOT NULL,
    product_sku text NOT NULL,
    question text NOT NULL,
    answer text NOT NULL,
    question_ru text,
    answer_ru text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: product_faq_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_faq_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_faq_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_faq_id_seq OWNED BY public.product_faq.id;


--
-- Name: product_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_prices (
    id integer NOT NULL,
    price_list_id integer NOT NULL,
    sku text NOT NULL,
    min_qty numeric(12,3) DEFAULT 1 NOT NULL,
    price numeric(12,2) NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT product_prices_price_check CHECK ((price >= (0)::numeric))
);


--
-- Name: product_prices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_prices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_prices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_prices_id_seq OWNED BY public.product_prices.id;


--
-- Name: product_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_sku text NOT NULL,
    author_name text NOT NULL,
    rating integer NOT NULL,
    review_text text,
    is_approved boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    is_verified boolean DEFAULT false NOT NULL,
    order_id uuid,
    CONSTRAINT product_reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- Name: product_seo_state; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.product_seo_state WITH (security_invoker='on') AS
 SELECT sku,
    slug,
    name,
    brand,
    category_slug,
    COALESCE(length(description_full), 0) AS desc_len,
    COALESCE(length(description_full_ru), 0) AS desc_ru_len,
    ((name_ru IS NULL) OR (btrim(name_ru) = ''::text) OR (description_ru IS NULL) OR (btrim(description_ru) = ''::text)) AS no_ru,
    ((keywords IS NULL) OR (btrim(keywords) = ''::text)) AS no_keywords,
    ((image IS NULL) OR (btrim(image) = ''::text)) AS no_image,
    ( SELECT count(*) AS count
           FROM public.product_faq f
          WHERE (f.product_sku = p.sku)) AS faq_count,
    ( SELECT count(*) AS count
           FROM public.product_faq f
          WHERE ((f.product_sku = p.sku) AND (f.question_ru IS NULL))) AS faq_untranslated,
    ( SELECT count(*) AS count
           FROM public.product_characteristics c
          WHERE (c.product_sku = p.sku)) AS chars_count
   FROM public.products p
  WHERE (is_active = true);


--
-- Name: product_stock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_stock (
    id integer NOT NULL,
    sku text NOT NULL,
    price_unit numeric(12,2) DEFAULT 0 NOT NULL,
    price_old numeric(12,2),
    stock_qty integer DEFAULT 0 NOT NULL,
    stock_status text DEFAULT 'in_stock'::text NOT NULL,
    supplier_sku text,
    updated_at timestamp with time zone DEFAULT now(),
    price_cost numeric,
    price_retail numeric(10,2),
    price_retail_old numeric(10,2),
    price_drop numeric(10,2) DEFAULT NULL::numeric,
    price_wholesale numeric(12,2),
    price_locked boolean DEFAULT false,
    price_promo numeric
);


--
-- Name: product_stock_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_stock_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_stock_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.product_stock_id_seq OWNED BY public.product_stock.id;


--
-- Name: products_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.products_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.products_id_seq OWNED BY public.products.id;


--
-- Name: prom_attribute_values; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prom_attribute_values (
    id integer NOT NULL,
    prom_attribute_id integer NOT NULL,
    value_id bigint NOT NULL,
    name_uk text,
    name_ru text,
    sort_order integer DEFAULT 0
);


--
-- Name: prom_attribute_values_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prom_attribute_values_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prom_attribute_values_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prom_attribute_values_id_seq OWNED BY public.prom_attribute_values.id;


--
-- Name: prom_attributes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prom_attributes (
    id integer NOT NULL,
    prom_category_id bigint NOT NULL,
    attribute_id bigint NOT NULL,
    name_uk text NOT NULL,
    name_ru text,
    type text NOT NULL,
    measure_unit_uk text,
    val_min numeric,
    val_max numeric,
    sort_order integer DEFAULT 0,
    CONSTRAINT prom_attributes_type_check CHECK ((type = ANY (ARRAY['singleselect'::text, 'multiselect'::text, 'real'::text, 'bool'::text])))
);


--
-- Name: prom_attributes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prom_attributes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prom_attributes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prom_attributes_id_seq OWNED BY public.prom_attributes.id;


--
-- Name: prom_commissions_ref; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prom_commissions_ref (
    prom_category_id bigint NOT NULL,
    name text NOT NULL,
    path text,
    commission_single numeric(6,3),
    commission_ecom numeric(6,3),
    commission_more numeric(6,3),
    commission_turbo numeric(6,3)
);


--
-- Name: promo_code_uses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promo_code_uses (
    id bigint NOT NULL,
    promo_id uuid NOT NULL,
    order_id uuid NOT NULL,
    customer_id uuid,
    discount_amount numeric(14,2) NOT NULL,
    used_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: promo_code_uses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.promo_code_uses_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: promo_code_uses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.promo_code_uses_id_seq OWNED BY public.promo_code_uses.id;


--
-- Name: promo_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promo_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    description text,
    discount_type text NOT NULL,
    discount_value numeric(10,2) NOT NULL,
    max_discount_amount numeric(14,2),
    min_order_amount numeric(14,2),
    applicable_channels text[],
    applicable_skus text[],
    applicable_categories text[],
    customer_types text[],
    max_uses integer,
    max_uses_per_customer integer DEFAULT 1 NOT NULL,
    uses_count integer DEFAULT 0 NOT NULL,
    valid_from timestamp with time zone,
    valid_until timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    created_by text,
    CONSTRAINT promo_codes_discount_type_check CHECK ((discount_type = ANY (ARRAY['percent'::text, 'fixed'::text, 'free_shipping'::text]))),
    CONSTRAINT promo_codes_discount_value_check CHECK ((discount_value > (0)::numeric))
);


--
-- Name: rozetka_category_tree; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rozetka_category_tree (
    rz_id text NOT NULL,
    name text NOT NULL,
    commission_rz_id text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE rozetka_category_tree; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.rozetka_category_tree IS 'Довідник категорій Rozetka з прив''язкою до батьківської комісійної категорії';


--
-- Name: COLUMN rozetka_category_tree.rz_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.rozetka_category_tree.rz_id IS 'ID категорії на Rozetka (з YML-фіду)';


--
-- Name: COLUMN rozetka_category_tree.name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.rozetka_category_tree.name IS 'Назва категорії Rozetka';


--
-- Name: COLUMN rozetka_category_tree.commission_rz_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.rozetka_category_tree.commission_rz_id IS 'ID категорії з PDF комісій (батьківська), NULL якщо сама є комісійною';


--
-- Name: rozetka_commission_brackets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rozetka_commission_brackets (
    id bigint NOT NULL,
    rz_id text NOT NULL,
    category_name text,
    brand text DEFAULT '-'::text NOT NULL,
    price_from numeric DEFAULT 0 NOT NULL,
    price_to numeric NOT NULL,
    base_pct numeric NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source text DEFAULT 'tariff'::text NOT NULL
);


--
-- Name: rozetka_commission_brackets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.rozetka_commission_brackets ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.rozetka_commission_brackets_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: rozetka_commission_refs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rozetka_commission_refs (
    rz_id text NOT NULL,
    name text NOT NULL,
    commission_pct numeric(5,2),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: rozetka_moderation_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rozetka_moderation_state (
    sku text NOT NULL,
    change_status text,
    reasons text[] DEFAULT '{}'::text[] NOT NULL,
    checked_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE rozetka_moderation_state; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.rozetka_moderation_state IS 'Останній побачений стан модерації по кожному товару. Джерело — Rozetka API (/goods/changes + blocked_reason), пише крон rozetka-moderation-watch.';


--
-- Name: sales_channels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_channels (
    code text NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0,
    CONSTRAINT sales_channels_type_check CHECK ((type = ANY (ARRAY['online'::text, 'retail'::text, 'marketplace'::text, 'b2b'::text, 'phone'::text, 'other'::text])))
);


--
-- Name: search_demand; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.search_demand (
    phrase text NOT NULL,
    lang text NOT NULL,
    category_slug text NOT NULL,
    modifier text DEFAULT ''::text NOT NULL,
    first_seen date DEFAULT CURRENT_DATE NOT NULL,
    last_seen date DEFAULT CURRENT_DATE NOT NULL,
    seen integer DEFAULT 1 NOT NULL,
    gsc_impressions integer,
    gsc_position numeric(6,1),
    covered_path text,
    CONSTRAINT search_demand_lang_check CHECK ((lang = ANY (ARRAY['uk'::text, 'ru'::text])))
);


--
-- Name: search_queries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.search_queries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    query text NOT NULL,
    results_count integer,
    user_id uuid
);


--
-- Name: seo_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.seo_actions (
    id bigint NOT NULL,
    page_path text NOT NULL,
    action text NOT NULL,
    query text,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text,
    cost_usd numeric(10,4),
    CONSTRAINT seo_actions_action_check CHECK ((action = ANY (ARRAY['article_boost'::text, 'article_products'::text, 'article_new'::text, 'article_categories'::text, 'product_boost'::text, 'cover'::text, 'meta_rewrite'::text, 'category_content'::text])))
);


--
-- Name: seo_actions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seo_actions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: seo_actions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.seo_actions_id_seq OWNED BY public.seo_actions.id;


--
-- Name: showcase_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.showcase_items (
    surface text NOT NULL,
    sku text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT showcase_items_surface_check CHECK ((surface = ANY (ARRAY['shop'::text, 'catalog'::text])))
);


--
-- Name: TABLE showcase_items; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.showcase_items IS 'Товари вітрини головної сторінки: surface shop/catalog, порядок — position';


--
-- Name: stock_balance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_balance (
    warehouse_id integer NOT NULL,
    sku text NOT NULL,
    qty_total numeric(12,3) DEFAULT 0 NOT NULL,
    qty_reserved numeric(12,3) DEFAULT 0 NOT NULL,
    qty_available numeric(12,3) GENERATED ALWAYS AS ((qty_total - qty_reserved)) STORED,
    avg_cost numeric(12,4) DEFAULT 0 NOT NULL,
    min_reorder_qty numeric(12,3),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT chk_qty_reserved_nonneg CHECK ((qty_reserved >= (0)::numeric)),
    CONSTRAINT chk_qty_total_nonneg CHECK ((qty_total >= (0)::numeric)),
    CONSTRAINT chk_reserved_lte_total CHECK ((qty_reserved <= qty_total))
);


--
-- Name: stock_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sku text NOT NULL,
    warehouse_id integer NOT NULL,
    supplier_id integer,
    document_id uuid,
    initial_qty numeric(12,3) NOT NULL,
    remaining_qty numeric(12,3) NOT NULL,
    cost_price numeric(12,4) DEFAULT 0 NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT stock_batches_initial_qty_check CHECK ((initial_qty > (0)::numeric)),
    CONSTRAINT stock_batches_remaining_qty_check CHECK ((remaining_qty >= (0)::numeric))
);


--
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_movements (
    id bigint NOT NULL,
    document_id uuid NOT NULL,
    document_line_id integer,
    doc_type text NOT NULL,
    warehouse_id integer NOT NULL,
    sku text NOT NULL,
    qty numeric(12,3) NOT NULL,
    cost_price numeric(12,4),
    sale_price numeric(12,2),
    moved_at timestamp with time zone DEFAULT now() NOT NULL,
    order_id uuid,
    supplier_id integer,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    batch_cost numeric(12,4),
    CONSTRAINT stock_movements_qty_check CHECK ((qty <> (0)::numeric))
);


--
-- Name: stock_movements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_movements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_movements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_movements_id_seq OWNED BY public.stock_movements.id;


--
-- Name: stock_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_notifications (
    id integer NOT NULL,
    sku text NOT NULL,
    email text NOT NULL,
    product_name text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: stock_notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_notifications_id_seq OWNED BY public.stock_notifications.id;


--
-- Name: stock_reservations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_reservations (
    id bigint NOT NULL,
    order_id uuid NOT NULL,
    sku text NOT NULL,
    warehouse_id integer NOT NULL,
    qty numeric(12,3) NOT NULL,
    reserved_at timestamp with time zone DEFAULT now() NOT NULL,
    released_at timestamp with time zone,
    release_reason text,
    expires_at timestamp with time zone,
    reservation_status text DEFAULT 'active'::text NOT NULL,
    CONSTRAINT stock_reservations_qty_check CHECK ((qty > (0)::numeric)),
    CONSTRAINT stock_reservations_reservation_status_check CHECK ((reservation_status = ANY (ARRAY['active'::text, 'expired'::text, 'released'::text])))
);


--
-- Name: stock_reservations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_reservations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_reservations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_reservations_id_seq OWNED BY public.stock_reservations.id;


--
-- Name: supplier_brand_discounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_brand_discounts (
    id integer NOT NULL,
    supplier_id integer NOT NULL,
    brand text NOT NULL,
    discount_pct numeric(5,2) DEFAULT 0 NOT NULL,
    markup_retail numeric(5,2),
    markup_wholesale numeric(5,2),
    markup_drop numeric(5,2),
    keep_price boolean DEFAULT false
);


--
-- Name: supplier_brand_discounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.supplier_brand_discounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: supplier_brand_discounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.supplier_brand_discounts_id_seq OWNED BY public.supplier_brand_discounts.id;


--
-- Name: supplier_contracts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_contracts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contract_number text NOT NULL,
    supplier_id integer NOT NULL,
    supplier_name text NOT NULL,
    payment_terms text DEFAULT 'prepay'::text,
    credit_days integer DEFAULT 0,
    credit_limit numeric DEFAULT 0,
    discount_pct numeric DEFAULT 0,
    currency text DEFAULT 'UAH'::text,
    start_date date,
    end_date date,
    status text DEFAULT 'active'::text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    created_by text,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT supplier_contracts_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'expired'::text])))
);


--
-- Name: supplier_payment_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_payment_allocations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payment_entry_id uuid NOT NULL,
    charge_entry_id uuid NOT NULL,
    amount numeric(14,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text,
    CONSTRAINT supplier_payment_allocations_amount_check CHECK ((amount > (0)::numeric))
);


--
-- Name: TABLE supplier_payment_allocations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.supplier_payment_allocations IS 'Рознесення оплат постачальнику по конкретних боргах. Залишок за накладною = |сума проводки| − сума рознесень.';


--
-- Name: supplier_product_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_product_overrides (
    supplier_id integer NOT NULL,
    our_sku text NOT NULL,
    markup_retail numeric(5,2),
    markup_wholesale numeric(5,2),
    markup_drop numeric(5,2),
    fixed_retail numeric(12,2),
    fixed_wholesale numeric(12,2),
    fixed_drop numeric(12,2),
    notes text,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: supplier_promotions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_promotions (
    id integer NOT NULL,
    supplier_id integer NOT NULL,
    name text NOT NULL,
    our_sku text,
    brand text,
    promo_type text DEFAULT 'percent'::text NOT NULL,
    value numeric(10,2) NOT NULL,
    apply_retail boolean DEFAULT true NOT NULL,
    apply_wholesale boolean DEFAULT false NOT NULL,
    apply_drop boolean DEFAULT false NOT NULL,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT supplier_promotions_promo_type_check CHECK ((promo_type = ANY (ARRAY['percent'::text, 'fixed_price'::text, 'fixed_discount'::text]))),
    CONSTRAINT supplier_promotions_value_check CHECK ((value > (0)::numeric))
);


--
-- Name: supplier_promotions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.supplier_promotions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: supplier_promotions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.supplier_promotions_id_seq OWNED BY public.supplier_promotions.id;


--
-- Name: supplier_sku_map; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_sku_map (
    supplier_id integer NOT NULL,
    supplier_sku text NOT NULL,
    our_sku text NOT NULL
);


--
-- Name: supplier_stock; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_stock (
    sku text NOT NULL,
    supplier_id integer NOT NULL,
    supplier_sku text,
    stock_qty integer DEFAULT 0 NOT NULL,
    stock_status text DEFAULT 'out_of_stock'::text NOT NULL,
    price_unit numeric(12,4),
    price_cost numeric(12,4),
    priority_override integer,
    last_synced_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT supplier_stock_stock_status_check CHECK ((stock_status = ANY (ARRAY['in_stock'::text, 'out_of_stock'::text, 'on_order'::text])))
);


--
-- Name: supplier_sync_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_sync_log (
    id integer NOT NULL,
    supplier_id integer NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    rows_total integer DEFAULT 0 NOT NULL,
    rows_updated integer DEFAULT 0 NOT NULL,
    rows_skipped integer DEFAULT 0 NOT NULL,
    rows_unmapped integer DEFAULT 0 NOT NULL,
    error_message text
);


--
-- Name: supplier_sync_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.supplier_sync_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: supplier_sync_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.supplier_sync_log_id_seq OWNED BY public.supplier_sync_log.id;


--
-- Name: supplier_unmapped_skus; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_unmapped_skus (
    supplier_id integer NOT NULL,
    supplier_sku text NOT NULL,
    sample_name text,
    price_in numeric(12,2),
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: suppliers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.suppliers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: suppliers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.suppliers_id_seq OWNED BY public.suppliers.id;


--
-- Name: sync_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sync_log (
    id integer NOT NULL,
    source text NOT NULL,
    status text NOT NULL,
    records_total integer DEFAULT 0,
    records_updated integer DEFAULT 0,
    records_skipped integer DEFAULT 0,
    error_details text,
    started_at timestamp with time zone DEFAULT now(),
    finished_at timestamp with time zone
);


--
-- Name: sync_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sync_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sync_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sync_log_id_seq OWNED BY public.sync_log.id;


--
-- Name: uom; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uom (
    code text NOT NULL,
    name text NOT NULL,
    name_short text NOT NULL,
    type text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0,
    CONSTRAINT uom_type_check CHECK ((type = ANY (ARRAY['piece'::text, 'weight'::text, 'volume'::text, 'area'::text, 'length'::text, 'package'::text])))
);


--
-- Name: uom_conversions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uom_conversions (
    id integer NOT NULL,
    sku text,
    from_uom text NOT NULL,
    to_uom text NOT NULL,
    ratio numeric(18,6) NOT NULL,
    CONSTRAINT uom_conversions_ratio_check CHECK ((ratio > (0)::numeric))
);


--
-- Name: uom_conversions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.uom_conversions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: uom_conversions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.uom_conversions_id_seq OWNED BY public.uom_conversions.id;


--
-- Name: warehouses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warehouses (
    id integer NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    warehouse_type text DEFAULT 'physical'::text NOT NULL,
    supplier_id integer,
    address text,
    is_default boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT warehouses_warehouse_type_check CHECK ((warehouse_type = ANY (ARRAY['physical'::text, 'supplier'::text, 'transit'::text])))
);


--
-- Name: warehouses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.warehouses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: warehouses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.warehouses_id_seq OWNED BY public.warehouses.id;


--
-- Name: webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source text NOT NULL,
    event_type text NOT NULL,
    external_event_id text,
    raw_headers jsonb DEFAULT '{}'::jsonb NOT NULL,
    raw_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 3 NOT NULL,
    retry_after timestamp with time zone,
    processed_at timestamp with time zone,
    processing_error text,
    related_order_id uuid,
    related_marketplace_order_id uuid,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT webhook_events_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'processed'::text, 'failed'::text, 'ignored'::text])))
);


--
-- Name: wishlists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wishlists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    product_sku text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: acc_document_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_document_lines ALTER COLUMN id SET DEFAULT nextval('public.acc_document_lines_id_seq'::regclass);


--
-- Name: blog_posts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_posts ALTER COLUMN id SET DEFAULT nextval('public.blog_posts_id_seq'::regclass);


--
-- Name: categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories ALTER COLUMN id SET DEFAULT nextval('public.categories_id_seq'::regclass);


--
-- Name: characteristic_definitions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.characteristic_definitions ALTER COLUMN id SET DEFAULT nextval('public.characteristic_definitions_id_seq'::regclass);


--
-- Name: characteristic_values id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.characteristic_values ALTER COLUMN id SET DEFAULT nextval('public.characteristic_values_id_seq'::regclass);


--
-- Name: customer_price_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_price_rules ALTER COLUMN id SET DEFAULT nextval('public.customer_price_rules_id_seq'::regclass);


--
-- Name: customers customer_number; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers ALTER COLUMN customer_number SET DEFAULT nextval('public.customers_customer_number_seq'::regclass);


--
-- Name: debt_adjustment_lines id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debt_adjustment_lines ALTER COLUMN id SET DEFAULT nextval('public.debt_adjustment_lines_id_seq'::regclass);


--
-- Name: exchange_rates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rates ALTER COLUMN id SET DEFAULT nextval('public.exchange_rates_id_seq'::regclass);


--
-- Name: fulfillment_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fulfillment_rules ALTER COLUMN id SET DEFAULT nextval('public.fulfillment_rules_id_seq'::regclass);


--
-- Name: marketplace_accounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_accounts ALTER COLUMN id SET DEFAULT nextval('public.marketplace_accounts_id_seq'::regclass);


--
-- Name: marketplace_listings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_listings ALTER COLUMN id SET DEFAULT nextval('public.marketplace_listings_id_seq'::regclass);


--
-- Name: marketplace_sync_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_sync_log ALTER COLUMN id SET DEFAULT nextval('public.marketplace_sync_log_id_seq'::regclass);


--
-- Name: marketplace_sync_queue id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_sync_queue ALTER COLUMN id SET DEFAULT nextval('public.marketplace_sync_queue_id_seq'::regclass);


--
-- Name: order_status_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_history ALTER COLUMN id SET DEFAULT nextval('public.order_status_history_id_seq'::regclass);


--
-- Name: orders order_number; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders ALTER COLUMN order_number SET DEFAULT nextval('public.orders_order_number_seq'::regclass);


--
-- Name: partner_balance_transactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_balance_transactions ALTER COLUMN id SET DEFAULT nextval('public.partner_balance_transactions_id_seq'::regclass);


--
-- Name: pos_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_sessions ALTER COLUMN id SET DEFAULT nextval('public.pos_sessions_id_seq'::regclass);


--
-- Name: pos_terminals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_terminals ALTER COLUMN id SET DEFAULT nextval('public.pos_terminals_id_seq'::regclass);


--
-- Name: price_change_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_change_log ALTER COLUMN id SET DEFAULT nextval('public.price_change_log_id_seq'::regclass);


--
-- Name: price_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_history ALTER COLUMN id SET DEFAULT nextval('public.price_history_id_seq'::regclass);


--
-- Name: price_lists id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_lists ALTER COLUMN id SET DEFAULT nextval('public.price_lists_id_seq'::regclass);


--
-- Name: pricing_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_rules ALTER COLUMN id SET DEFAULT nextval('public.pricing_rules_id_seq'::regclass);


--
-- Name: product_characteristics id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_characteristics ALTER COLUMN id SET DEFAULT nextval('public.product_characteristics_id_seq'::regclass);


--
-- Name: product_faq id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_faq ALTER COLUMN id SET DEFAULT nextval('public.product_faq_id_seq'::regclass);


--
-- Name: product_prices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_prices ALTER COLUMN id SET DEFAULT nextval('public.product_prices_id_seq'::regclass);


--
-- Name: product_stock id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_stock ALTER COLUMN id SET DEFAULT nextval('public.product_stock_id_seq'::regclass);


--
-- Name: products id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products ALTER COLUMN id SET DEFAULT nextval('public.products_id_seq'::regclass);


--
-- Name: prom_attribute_values id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prom_attribute_values ALTER COLUMN id SET DEFAULT nextval('public.prom_attribute_values_id_seq'::regclass);


--
-- Name: prom_attributes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prom_attributes ALTER COLUMN id SET DEFAULT nextval('public.prom_attributes_id_seq'::regclass);


--
-- Name: promo_code_uses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_code_uses ALTER COLUMN id SET DEFAULT nextval('public.promo_code_uses_id_seq'::regclass);


--
-- Name: seo_actions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seo_actions ALTER COLUMN id SET DEFAULT nextval('public.seo_actions_id_seq'::regclass);


--
-- Name: stock_movements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements ALTER COLUMN id SET DEFAULT nextval('public.stock_movements_id_seq'::regclass);


--
-- Name: stock_notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_notifications ALTER COLUMN id SET DEFAULT nextval('public.stock_notifications_id_seq'::regclass);


--
-- Name: stock_reservations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_reservations ALTER COLUMN id SET DEFAULT nextval('public.stock_reservations_id_seq'::regclass);


--
-- Name: supplier_brand_discounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_brand_discounts ALTER COLUMN id SET DEFAULT nextval('public.supplier_brand_discounts_id_seq'::regclass);


--
-- Name: supplier_promotions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_promotions ALTER COLUMN id SET DEFAULT nextval('public.supplier_promotions_id_seq'::regclass);


--
-- Name: supplier_sync_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_sync_log ALTER COLUMN id SET DEFAULT nextval('public.supplier_sync_log_id_seq'::regclass);


--
-- Name: suppliers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers ALTER COLUMN id SET DEFAULT nextval('public.suppliers_id_seq'::regclass);


--
-- Name: sync_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_log ALTER COLUMN id SET DEFAULT nextval('public.sync_log_id_seq'::regclass);


--
-- Name: uom_conversions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uom_conversions ALTER COLUMN id SET DEFAULT nextval('public.uom_conversions_id_seq'::regclass);


--
-- Name: warehouses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses ALTER COLUMN id SET DEFAULT nextval('public.warehouses_id_seq'::regclass);


--
-- Name: abandoned_carts abandoned_carts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.abandoned_carts
    ADD CONSTRAINT abandoned_carts_pkey PRIMARY KEY (id);


--
-- Name: acc_doc_sequences acc_doc_sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_doc_sequences
    ADD CONSTRAINT acc_doc_sequences_pkey PRIMARY KEY (doc_type);


--
-- Name: acc_doc_types acc_doc_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_doc_types
    ADD CONSTRAINT acc_doc_types_pkey PRIMARY KEY (code);


--
-- Name: acc_document_lines acc_document_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_document_lines
    ADD CONSTRAINT acc_document_lines_pkey PRIMARY KEY (id);


--
-- Name: acc_documents acc_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_documents
    ADD CONSTRAINT acc_documents_pkey PRIMARY KEY (id);


--
-- Name: acc_expense_categories acc_expense_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_expense_categories
    ADD CONSTRAINT acc_expense_categories_pkey PRIMARY KEY (code);


--
-- Name: acc_expenses acc_expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_expenses
    ADD CONSTRAINT acc_expenses_pkey PRIMARY KEY (id);


--
-- Name: acc_payment_methods acc_payment_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_payment_methods
    ADD CONSTRAINT acc_payment_methods_pkey PRIMARY KEY (code);


--
-- Name: acc_payments acc_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_payments
    ADD CONSTRAINT acc_payments_pkey PRIMARY KEY (id);


--
-- Name: acc_periods acc_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_periods
    ADD CONSTRAINT acc_periods_pkey PRIMARY KEY (period);


--
-- Name: ads_conversions ads_conversions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ads_conversions
    ADD CONSTRAINT ads_conversions_pkey PRIMARY KEY (order_id);


--
-- Name: ads_spend ads_spend_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ads_spend
    ADD CONSTRAINT ads_spend_pkey PRIMARY KEY (date, campaign_id);


--
-- Name: ai_agent_runs ai_agent_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_runs
    ADD CONSTRAINT ai_agent_runs_pkey PRIMARY KEY (id);


--
-- Name: ai_bot_hits ai_bot_hits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_bot_hits
    ADD CONSTRAINT ai_bot_hits_pkey PRIMARY KEY (day, bot, section);


--
-- Name: ai_referrals ai_referrals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_referrals
    ADD CONSTRAINT ai_referrals_pkey PRIMARY KEY (day, source, landing_path);


--
-- Name: alert_throttle alert_throttle_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_throttle
    ADD CONSTRAINT alert_throttle_pkey PRIMARY KEY (title);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);


--
-- Name: ar_corrections ar_corrections_doc_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ar_corrections
    ADD CONSTRAINT ar_corrections_doc_number_key UNIQUE (doc_number);


--
-- Name: ar_corrections ar_corrections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ar_corrections
    ADD CONSTRAINT ar_corrections_pkey PRIMARY KEY (id);


--
-- Name: blog_posts blog_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_posts
    ADD CONSTRAINT blog_posts_pkey PRIMARY KEY (id);


--
-- Name: blog_posts blog_posts_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blog_posts
    ADD CONSTRAINT blog_posts_slug_key UNIQUE (slug);


--
-- Name: brand_logos brand_logos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brand_logos
    ADD CONSTRAINT brand_logos_pkey PRIMARY KEY (brand_name);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: categories categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_slug_key UNIQUE (slug);


--
-- Name: category_characteristics category_characteristics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_characteristics
    ADD CONSTRAINT category_characteristics_pkey PRIMARY KEY (category_slug, definition_id);


--
-- Name: category_content category_content_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_content
    ADD CONSTRAINT category_content_pkey PRIMARY KEY (slug, lang);


--
-- Name: characteristic_definitions characteristic_definitions_label_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.characteristic_definitions
    ADD CONSTRAINT characteristic_definitions_label_key UNIQUE (label);


--
-- Name: characteristic_definitions characteristic_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.characteristic_definitions
    ADD CONSTRAINT characteristic_definitions_pkey PRIMARY KEY (id);


--
-- Name: characteristic_values characteristic_values_definition_id_value_category_slugs_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.characteristic_values
    ADD CONSTRAINT characteristic_values_definition_id_value_category_slugs_key UNIQUE (definition_id, value, category_slugs);


--
-- Name: characteristic_values characteristic_values_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.characteristic_values
    ADD CONSTRAINT characteristic_values_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: chat_sessions chat_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_sessions
    ADD CONSTRAINT chat_sessions_pkey PRIMARY KEY (id);


--
-- Name: counterparty_balances counterparty_balances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.counterparty_balances
    ADD CONSTRAINT counterparty_balances_pkey PRIMARY KEY (counterparty_id, account_type, currency);


--
-- Name: currencies currencies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.currencies
    ADD CONSTRAINT currencies_pkey PRIMARY KEY (code);


--
-- Name: customer_contracts customer_contracts_customer_id_contract_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_contracts
    ADD CONSTRAINT customer_contracts_customer_id_contract_number_key UNIQUE (customer_id, contract_number);


--
-- Name: customer_contracts customer_contracts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_contracts
    ADD CONSTRAINT customer_contracts_pkey PRIMARY KEY (id);


--
-- Name: customer_notifications customer_notifications_order_id_event_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_notifications
    ADD CONSTRAINT customer_notifications_order_id_event_key UNIQUE (order_id, event);


--
-- Name: customer_notifications customer_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_notifications
    ADD CONSTRAINT customer_notifications_pkey PRIMARY KEY (id);


--
-- Name: customer_price_rules customer_price_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_price_rules
    ADD CONSTRAINT customer_price_rules_pkey PRIMARY KEY (id);


--
-- Name: customers customers_auth_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_auth_user_id_key UNIQUE (auth_user_id);


--
-- Name: customers customers_partner_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_partner_code_key UNIQUE (partner_code);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: debt_adjustment_lines debt_adjustment_lines_document_id_line_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debt_adjustment_lines
    ADD CONSTRAINT debt_adjustment_lines_document_id_line_no_key UNIQUE (document_id, line_no);


--
-- Name: debt_adjustment_lines debt_adjustment_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debt_adjustment_lines
    ADD CONSTRAINT debt_adjustment_lines_pkey PRIMARY KEY (id);


--
-- Name: exchange_rates exchange_rates_currency_rate_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rates
    ADD CONSTRAINT exchange_rates_currency_rate_date_key UNIQUE (currency, rate_date);


--
-- Name: exchange_rates exchange_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rates
    ADD CONSTRAINT exchange_rates_pkey PRIMARY KEY (id);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: fulfillment_rules fulfillment_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fulfillment_rules
    ADD CONSTRAINT fulfillment_rules_pkey PRIMARY KEY (id);


--
-- Name: gsc_daily gsc_daily_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gsc_daily
    ADD CONSTRAINT gsc_daily_pkey PRIMARY KEY (date, page_path);


--
-- Name: landed_cost_lines landed_cost_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landed_cost_lines
    ADD CONSTRAINT landed_cost_lines_pkey PRIMARY KEY (id);


--
-- Name: mail_oauth_tokens mail_oauth_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mail_oauth_tokens
    ADD CONSTRAINT mail_oauth_tokens_pkey PRIMARY KEY (id);


--
-- Name: mail_read_messages mail_read_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mail_read_messages
    ADD CONSTRAINT mail_read_messages_pkey PRIMARY KEY (message_id);


--
-- Name: mail_register_imports mail_register_imports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mail_register_imports
    ADD CONSTRAINT mail_register_imports_pkey PRIMARY KEY (message_id);


--
-- Name: market_price_checks market_price_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.market_price_checks
    ADD CONSTRAINT market_price_checks_pkey PRIMARY KEY (id);


--
-- Name: market_price_checks market_price_checks_sku_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.market_price_checks
    ADD CONSTRAINT market_price_checks_sku_key UNIQUE (sku);


--
-- Name: marketplace_accounts marketplace_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_accounts
    ADD CONSTRAINT marketplace_accounts_pkey PRIMARY KEY (id);


--
-- Name: marketplace_chat_drafts marketplace_chat_drafts_mp_chat_id_last_incoming_at_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_chat_drafts
    ADD CONSTRAINT marketplace_chat_drafts_mp_chat_id_last_incoming_at_key UNIQUE (mp, chat_id, last_incoming_at);


--
-- Name: marketplace_chat_drafts marketplace_chat_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_chat_drafts
    ADD CONSTRAINT marketplace_chat_drafts_pkey PRIMARY KEY (id);


--
-- Name: marketplace_chat_seen marketplace_chat_seen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_chat_seen
    ADD CONSTRAINT marketplace_chat_seen_pkey PRIMARY KEY (mp, chat_id);


--
-- Name: marketplace_listings marketplace_listings_marketplace_id_sku_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_listings
    ADD CONSTRAINT marketplace_listings_marketplace_id_sku_key UNIQUE (marketplace_id, sku);


--
-- Name: marketplace_listings marketplace_listings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_listings
    ADD CONSTRAINT marketplace_listings_pkey PRIMARY KEY (id);


--
-- Name: marketplace_orders marketplace_orders_marketplace_id_external_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_orders
    ADD CONSTRAINT marketplace_orders_marketplace_id_external_order_id_key UNIQUE (marketplace_id, external_order_id);


--
-- Name: marketplace_orders marketplace_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_orders
    ADD CONSTRAINT marketplace_orders_pkey PRIMARY KEY (id);


--
-- Name: marketplace_refunds marketplace_refunds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_refunds
    ADD CONSTRAINT marketplace_refunds_pkey PRIMARY KEY (marketplace, refund_id);


--
-- Name: marketplace_status_map marketplace_status_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_status_map
    ADD CONSTRAINT marketplace_status_map_pkey PRIMARY KEY (marketplace_id, external_status);


--
-- Name: marketplace_sync_log marketplace_sync_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_sync_log
    ADD CONSTRAINT marketplace_sync_log_pkey PRIMARY KEY (id);


--
-- Name: marketplace_sync_queue marketplace_sync_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_sync_queue
    ADD CONSTRAINT marketplace_sync_queue_pkey PRIMARY KEY (id);


--
-- Name: money_entries money_entries_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.money_entries
    ADD CONSTRAINT money_entries_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: money_entries money_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.money_entries
    ADD CONSTRAINT money_entries_pkey PRIMARY KEY (id);


--
-- Name: mono_bank_txns mono_bank_txns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mono_bank_txns
    ADD CONSTRAINT mono_bank_txns_pkey PRIMARY KEY (id);


--
-- Name: novapay_txns novapay_txns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.novapay_txns
    ADD CONSTRAINT novapay_txns_pkey PRIMARY KEY (id);


--
-- Name: order_edits order_edits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_edits
    ADD CONSTRAINT order_edits_pkey PRIMARY KEY (id);


--
-- Name: order_number_seq order_number_seq_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_number_seq
    ADD CONSTRAINT order_number_seq_pkey PRIMARY KEY (ym);


--
-- Name: order_payments order_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_payments
    ADD CONSTRAINT order_payments_pkey PRIMARY KEY (id);


--
-- Name: order_status_history order_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_status_history
    ADD CONSTRAINT order_status_history_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: partner_balance_transactions partner_balance_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_balance_transactions
    ADD CONSTRAINT partner_balance_transactions_pkey PRIMARY KEY (id);


--
-- Name: partner_payout_requests partner_payout_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_payout_requests
    ADD CONSTRAINT partner_payout_requests_pkey PRIMARY KEY (id);


--
-- Name: pending_card_orders pending_card_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_card_orders
    ADD CONSTRAINT pending_card_orders_pkey PRIMARY KEY (id);


--
-- Name: pending_card_orders pending_card_orders_reference_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_card_orders
    ADD CONSTRAINT pending_card_orders_reference_key UNIQUE (reference);


--
-- Name: pos_sessions pos_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_sessions
    ADD CONSTRAINT pos_sessions_pkey PRIMARY KEY (id);


--
-- Name: pos_terminals pos_terminals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_terminals
    ADD CONSTRAINT pos_terminals_pkey PRIMARY KEY (id);


--
-- Name: price_change_log price_change_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_change_log
    ADD CONSTRAINT price_change_log_pkey PRIMARY KEY (id);


--
-- Name: price_history price_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_history
    ADD CONSTRAINT price_history_pkey PRIMARY KEY (id);


--
-- Name: price_lists price_lists_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_lists
    ADD CONSTRAINT price_lists_code_key UNIQUE (code);


--
-- Name: price_lists price_lists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_lists
    ADD CONSTRAINT price_lists_pkey PRIMARY KEY (id);


--
-- Name: pricing_rules pricing_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_rules
    ADD CONSTRAINT pricing_rules_pkey PRIMARY KEY (id);


--
-- Name: product_characteristics product_characteristics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_characteristics
    ADD CONSTRAINT product_characteristics_pkey PRIMARY KEY (id);


--
-- Name: product_faq product_faq_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_faq
    ADD CONSTRAINT product_faq_pkey PRIMARY KEY (id);


--
-- Name: product_prices product_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_prices
    ADD CONSTRAINT product_prices_pkey PRIMARY KEY (id);


--
-- Name: product_prices product_prices_price_list_id_sku_min_qty_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_prices
    ADD CONSTRAINT product_prices_price_list_id_sku_min_qty_key UNIQUE (price_list_id, sku, min_qty);


--
-- Name: product_reviews product_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews
    ADD CONSTRAINT product_reviews_pkey PRIMARY KEY (id);


--
-- Name: product_stock product_stock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_stock
    ADD CONSTRAINT product_stock_pkey PRIMARY KEY (id);


--
-- Name: product_stock product_stock_sku_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_stock
    ADD CONSTRAINT product_stock_sku_key UNIQUE (sku);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: products products_sku_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_sku_key UNIQUE (sku);


--
-- Name: products products_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_slug_key UNIQUE (slug);


--
-- Name: prom_attribute_values prom_attribute_values_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prom_attribute_values
    ADD CONSTRAINT prom_attribute_values_pkey PRIMARY KEY (id);


--
-- Name: prom_attribute_values prom_attribute_values_prom_attribute_id_value_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prom_attribute_values
    ADD CONSTRAINT prom_attribute_values_prom_attribute_id_value_id_key UNIQUE (prom_attribute_id, value_id);


--
-- Name: prom_attributes prom_attributes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prom_attributes
    ADD CONSTRAINT prom_attributes_pkey PRIMARY KEY (id);


--
-- Name: prom_attributes prom_attributes_prom_category_id_attribute_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prom_attributes
    ADD CONSTRAINT prom_attributes_prom_category_id_attribute_id_key UNIQUE (prom_category_id, attribute_id);


--
-- Name: prom_commissions_ref prom_commissions_ref_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prom_commissions_ref
    ADD CONSTRAINT prom_commissions_ref_pkey PRIMARY KEY (prom_category_id);


--
-- Name: promo_code_uses promo_code_uses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_code_uses
    ADD CONSTRAINT promo_code_uses_pkey PRIMARY KEY (id);


--
-- Name: promo_code_uses promo_code_uses_promo_id_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_code_uses
    ADD CONSTRAINT promo_code_uses_promo_id_order_id_key UNIQUE (promo_id, order_id);


--
-- Name: promo_codes promo_codes_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_codes
    ADD CONSTRAINT promo_codes_code_key UNIQUE (code);


--
-- Name: promo_codes promo_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_codes
    ADD CONSTRAINT promo_codes_pkey PRIMARY KEY (id);


--
-- Name: rozetka_category_tree rozetka_category_tree_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rozetka_category_tree
    ADD CONSTRAINT rozetka_category_tree_pkey PRIMARY KEY (rz_id);


--
-- Name: rozetka_commission_brackets rozetka_commission_brackets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rozetka_commission_brackets
    ADD CONSTRAINT rozetka_commission_brackets_pkey PRIMARY KEY (id);


--
-- Name: rozetka_commission_brackets rozetka_commission_brackets_rz_id_brand_price_from_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rozetka_commission_brackets
    ADD CONSTRAINT rozetka_commission_brackets_rz_id_brand_price_from_key UNIQUE (rz_id, brand, price_from);


--
-- Name: rozetka_commission_refs rozetka_commission_refs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rozetka_commission_refs
    ADD CONSTRAINT rozetka_commission_refs_pkey PRIMARY KEY (rz_id);


--
-- Name: rozetka_moderation_state rozetka_moderation_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rozetka_moderation_state
    ADD CONSTRAINT rozetka_moderation_state_pkey PRIMARY KEY (sku);


--
-- Name: sales_channels sales_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_channels
    ADD CONSTRAINT sales_channels_pkey PRIMARY KEY (code);


--
-- Name: search_demand search_demand_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_demand
    ADD CONSTRAINT search_demand_pkey PRIMARY KEY (phrase, lang);


--
-- Name: search_queries search_queries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_queries
    ADD CONSTRAINT search_queries_pkey PRIMARY KEY (id);


--
-- Name: seo_actions seo_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.seo_actions
    ADD CONSTRAINT seo_actions_pkey PRIMARY KEY (id);


--
-- Name: showcase_items showcase_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.showcase_items
    ADD CONSTRAINT showcase_items_pkey PRIMARY KEY (surface, sku);


--
-- Name: stock_balance stock_balance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_balance
    ADD CONSTRAINT stock_balance_pkey PRIMARY KEY (warehouse_id, sku);


--
-- Name: stock_batches stock_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_batches
    ADD CONSTRAINT stock_batches_pkey PRIMARY KEY (id);


--
-- Name: stock_movements stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);


--
-- Name: stock_notifications stock_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_notifications
    ADD CONSTRAINT stock_notifications_pkey PRIMARY KEY (id);


--
-- Name: stock_notifications stock_notifications_sku_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_notifications
    ADD CONSTRAINT stock_notifications_sku_email_key UNIQUE (sku, email);


--
-- Name: stock_reservations stock_reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_reservations
    ADD CONSTRAINT stock_reservations_pkey PRIMARY KEY (id);


--
-- Name: supplier_brand_discounts supplier_brand_discounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_brand_discounts
    ADD CONSTRAINT supplier_brand_discounts_pkey PRIMARY KEY (id);


--
-- Name: supplier_brand_discounts supplier_brand_discounts_supplier_id_brand_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_brand_discounts
    ADD CONSTRAINT supplier_brand_discounts_supplier_id_brand_key UNIQUE (supplier_id, brand);


--
-- Name: supplier_contracts supplier_contracts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_contracts
    ADD CONSTRAINT supplier_contracts_pkey PRIMARY KEY (id);


--
-- Name: supplier_payment_allocations supplier_payment_allocations_payment_entry_id_charge_entry__key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_payment_allocations
    ADD CONSTRAINT supplier_payment_allocations_payment_entry_id_charge_entry__key UNIQUE (payment_entry_id, charge_entry_id);


--
-- Name: supplier_payment_allocations supplier_payment_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_payment_allocations
    ADD CONSTRAINT supplier_payment_allocations_pkey PRIMARY KEY (id);


--
-- Name: supplier_product_overrides supplier_product_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_product_overrides
    ADD CONSTRAINT supplier_product_overrides_pkey PRIMARY KEY (supplier_id, our_sku);


--
-- Name: supplier_promotions supplier_promotions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_promotions
    ADD CONSTRAINT supplier_promotions_pkey PRIMARY KEY (id);


--
-- Name: supplier_sku_map supplier_sku_map_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_sku_map
    ADD CONSTRAINT supplier_sku_map_pkey PRIMARY KEY (supplier_id, supplier_sku);


--
-- Name: supplier_stock supplier_stock_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_stock
    ADD CONSTRAINT supplier_stock_pkey PRIMARY KEY (sku, supplier_id);


--
-- Name: supplier_sync_log supplier_sync_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_sync_log
    ADD CONSTRAINT supplier_sync_log_pkey PRIMARY KEY (id);


--
-- Name: supplier_unmapped_skus supplier_unmapped_skus_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_unmapped_skus
    ADD CONSTRAINT supplier_unmapped_skus_pkey PRIMARY KEY (supplier_id, supplier_sku);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: suppliers suppliers_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_slug_key UNIQUE (slug);


--
-- Name: sync_log sync_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sync_log
    ADD CONSTRAINT sync_log_pkey PRIMARY KEY (id);


--
-- Name: uom_conversions uom_conversions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uom_conversions
    ADD CONSTRAINT uom_conversions_pkey PRIMARY KEY (id);


--
-- Name: uom_conversions uom_conversions_sku_from_uom_to_uom_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uom_conversions
    ADD CONSTRAINT uom_conversions_sku_from_uom_to_uom_key UNIQUE (sku, from_uom, to_uom);


--
-- Name: uom uom_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uom
    ADD CONSTRAINT uom_pkey PRIMARY KEY (code);


--
-- Name: warehouses warehouses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_pkey PRIMARY KEY (id);


--
-- Name: warehouses warehouses_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_slug_key UNIQUE (slug);


--
-- Name: webhook_events webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_pkey PRIMARY KEY (id);


--
-- Name: wishlists wishlists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wishlists
    ADD CONSTRAINT wishlists_pkey PRIMARY KEY (id);


--
-- Name: wishlists wishlists_user_id_product_sku_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wishlists
    ADD CONSTRAINT wishlists_user_id_product_sku_key UNIQUE (user_id, product_sku);


--
-- Name: ai_bot_hits_day_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_bot_hits_day_idx ON public.ai_bot_hits USING btree (day DESC);


--
-- Name: ai_referrals_day_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_referrals_day_idx ON public.ai_referrals USING btree (day DESC);


--
-- Name: currencies_one_base; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX currencies_one_base ON public.currencies USING btree (is_base) WHERE (is_base = true);


--
-- Name: gsc_daily_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gsc_daily_date_idx ON public.gsc_daily USING btree (date DESC);


--
-- Name: gsc_daily_page_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX gsc_daily_page_idx ON public.gsc_daily USING btree (page_path, date DESC);


--
-- Name: idx_abandoned_carts_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_abandoned_carts_email ON public.abandoned_carts USING btree (email) WHERE (recovered_at IS NULL);


--
-- Name: idx_abandoned_carts_remind; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_abandoned_carts_remind ON public.abandoned_carts USING btree (last_seen_at) WHERE (recovered_at IS NULL);


--
-- Name: idx_abandoned_carts_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_abandoned_carts_token ON public.abandoned_carts USING btree (recover_token);


--
-- Name: idx_acc_doc_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_acc_doc_customer ON public.acc_documents USING btree (customer_id) WHERE (customer_id IS NOT NULL);


--
-- Name: idx_acc_doc_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_acc_doc_date ON public.acc_documents USING btree (doc_date DESC);


--
-- Name: idx_acc_doc_one_reversal; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_acc_doc_one_reversal ON public.acc_documents USING btree (reversal_of) WHERE ((status <> 'cancelled'::text) AND (reversal_of IS NOT NULL));


--
-- Name: idx_acc_doc_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_acc_doc_order ON public.acc_documents USING btree (order_id);


--
-- Name: idx_acc_doc_reversal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_acc_doc_reversal ON public.acc_documents USING btree (reversal_of) WHERE (reversal_of IS NOT NULL);


--
-- Name: idx_acc_doc_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_acc_doc_status ON public.acc_documents USING btree (status);


--
-- Name: idx_acc_doc_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_acc_doc_supplier ON public.acc_documents USING btree (supplier_id);


--
-- Name: idx_acc_doc_tracking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_acc_doc_tracking ON public.acc_documents USING btree (tracking_number) WHERE (tracking_number IS NOT NULL);


--
-- Name: idx_acc_doc_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_acc_doc_type ON public.acc_documents USING btree (doc_type);


--
-- Name: idx_acc_documents_tracking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_acc_documents_tracking ON public.acc_documents USING btree (tracking_number) WHERE (tracking_number IS NOT NULL);


--
-- Name: idx_ads_spend_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ads_spend_date ON public.ads_spend USING btree (date);


--
-- Name: idx_ai_agent_runs_agent_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_agent_runs_agent_created ON public.ai_agent_runs USING btree (agent, created_at DESC);


--
-- Name: idx_ar_corrections_from; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ar_corrections_from ON public.ar_corrections USING btree (from_contract_id);


--
-- Name: idx_ar_corrections_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ar_corrections_to ON public.ar_corrections USING btree (to_contract_id);


--
-- Name: idx_balance_reorder; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_balance_reorder ON public.stock_balance USING btree (warehouse_id) WHERE (min_reorder_qty IS NOT NULL);


--
-- Name: idx_balance_sku; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_balance_sku ON public.stock_balance USING btree (sku);


--
-- Name: idx_batches_document; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_batches_document ON public.stock_batches USING btree (document_id);


--
-- Name: idx_batches_fifo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_batches_fifo ON public.stock_batches USING btree (sku, warehouse_id, received_at) WHERE (remaining_qty > (0)::numeric);


--
-- Name: idx_blog_posts_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blog_posts_published ON public.blog_posts USING btree (is_published, published_at DESC);


--
-- Name: idx_category_chars_cat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_category_chars_cat ON public.category_characteristics USING btree (category_slug);


--
-- Name: idx_char_values_def; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_char_values_def ON public.characteristic_values USING btree (definition_id);


--
-- Name: idx_chars_sku; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chars_sku ON public.product_characteristics USING btree (product_sku);


--
-- Name: idx_chat_messages_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_session ON public.chat_messages USING btree (session_id, created_at);


--
-- Name: idx_chat_sessions_last; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_sessions_last ON public.chat_sessions USING btree (last_message_at DESC);


--
-- Name: idx_contracts_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contracts_customer ON public.customer_contracts USING btree (customer_id);


--
-- Name: idx_contracts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contracts_status ON public.customer_contracts USING btree (status);


--
-- Name: idx_cust_price_rules_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cust_price_rules_customer ON public.customer_price_rules USING btree (customer_id) WHERE (is_active = true);


--
-- Name: idx_cust_price_rules_sku; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cust_price_rules_sku ON public.customer_price_rules USING btree (sku) WHERE ((sku IS NOT NULL) AND (is_active = true));


--
-- Name: idx_customer_notifications_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_notifications_created ON public.customer_notifications USING btree (created_at DESC);


--
-- Name: idx_customer_notifications_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_notifications_status ON public.customer_notifications USING btree (status) WHERE (status <> 'sent'::text);


--
-- Name: idx_customers_auth_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_auth_user ON public.customers USING btree (auth_user_id) WHERE (auth_user_id IS NOT NULL);


--
-- Name: idx_customers_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_email ON public.customers USING btree (email);


--
-- Name: idx_customers_partner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_partner ON public.customers USING btree (partner_code) WHERE (partner_code IS NOT NULL);


--
-- Name: idx_customers_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_phone ON public.customers USING btree (phone);


--
-- Name: idx_customers_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_type ON public.customers USING btree (type) WHERE (is_active = true);


--
-- Name: idx_debt_adj_lines_doc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_debt_adj_lines_doc ON public.debt_adjustment_lines USING btree (document_id);


--
-- Name: idx_doc_lines_document; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_doc_lines_document ON public.acc_document_lines USING btree (document_id);


--
-- Name: idx_doc_lines_po_line; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_doc_lines_po_line ON public.acc_document_lines USING btree (po_line_id) WHERE (po_line_id IS NOT NULL);


--
-- Name: idx_doc_lines_sku; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_doc_lines_sku ON public.acc_document_lines USING btree (sku);


--
-- Name: idx_docs_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_docs_parent ON public.acc_documents USING btree (parent_doc_id) WHERE (parent_doc_id IS NOT NULL);


--
-- Name: idx_docs_proc_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_docs_proc_status ON public.acc_documents USING btree (procurement_status) WHERE (procurement_status IS NOT NULL);


--
-- Name: idx_exchange_rates_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exchange_rates_lookup ON public.exchange_rates USING btree (currency, rate_date DESC);


--
-- Name: idx_expenses_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_category ON public.acc_expenses USING btree (category);


--
-- Name: idx_expenses_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_date ON public.acc_expenses USING btree (expense_date DESC);


--
-- Name: idx_expenses_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_source ON public.expenses USING btree (source, source_id) WHERE (source_id IS NOT NULL);


--
-- Name: idx_expenses_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_type ON public.expenses USING btree (expense_type, business_date);


--
-- Name: idx_fulfillment_rules_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fulfillment_rules_active ON public.fulfillment_rules USING btree (priority) WHERE (is_active = true);


--
-- Name: idx_lc_document; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lc_document ON public.landed_cost_lines USING btree (document_id);


--
-- Name: idx_listings_marketplace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_listings_marketplace ON public.marketplace_listings USING btree (marketplace_id, is_listed);


--
-- Name: idx_listings_needs_sync; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_listings_needs_sync ON public.marketplace_listings USING btree (marketplace_id, id) WHERE ((needs_sync = true) AND (is_listed = true));


--
-- Name: idx_listings_sku; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_listings_sku ON public.marketplace_listings USING btree (sku);


--
-- Name: idx_listings_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_listings_status ON public.marketplace_listings USING btree (marketplace_id, listing_status);


--
-- Name: idx_marketplace_refunds_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketplace_refunds_order ON public.marketplace_refunds USING btree (order_id);


--
-- Name: idx_money_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_money_account ON public.money_entries USING btree (account_type, business_date);


--
-- Name: idx_money_contract; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_money_contract ON public.money_entries USING btree (contract_id) WHERE (contract_id IS NOT NULL);


--
-- Name: idx_money_counterparty; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_money_counterparty ON public.money_entries USING btree (counterparty_id, business_date);


--
-- Name: idx_money_doc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_money_doc ON public.money_entries USING btree (doc_id) WHERE (doc_id IS NOT NULL);


--
-- Name: idx_money_idem; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_money_idem ON public.money_entries USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: idx_money_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_money_order ON public.money_entries USING btree (order_id) WHERE (order_id IS NOT NULL);


--
-- Name: idx_money_txn; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_money_txn ON public.money_entries USING btree (txn_id);


--
-- Name: idx_movements_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_movements_date ON public.stock_movements USING btree (moved_at DESC);


--
-- Name: idx_movements_document; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_movements_document ON public.stock_movements USING btree (document_id);


--
-- Name: idx_movements_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_movements_order ON public.stock_movements USING btree (order_id);


--
-- Name: idx_movements_sku; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_movements_sku ON public.stock_movements USING btree (sku);


--
-- Name: idx_movements_warehouse; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_movements_warehouse ON public.stock_movements USING btree (warehouse_id, sku);


--
-- Name: idx_mp_accounts_platform; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mp_accounts_platform ON public.marketplace_accounts USING btree (platform) WHERE (is_active = true);


--
-- Name: idx_mp_chat_drafts_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mp_chat_drafts_created ON public.marketplace_chat_drafts USING btree (created_at DESC);


--
-- Name: idx_mp_orders_marketplace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mp_orders_marketplace ON public.marketplace_orders USING btree (marketplace_id, imported_at DESC);


--
-- Name: idx_mp_orders_our_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mp_orders_our_order ON public.marketplace_orders USING btree (our_order_id) WHERE (our_order_id IS NOT NULL);


--
-- Name: idx_mp_orders_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mp_orders_pending ON public.marketplace_orders USING btree (marketplace_id, imported_at) WHERE ((our_order_id IS NULL) AND (processing_error IS NULL));


--
-- Name: idx_order_payments_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_payments_order_id ON public.order_payments USING btree (order_id);


--
-- Name: idx_order_status_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_status_order ON public.order_status_history USING btree (order_id, changed_at DESC);


--
-- Name: idx_orders_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_customer ON public.orders USING btree (customer_id) WHERE (customer_id IS NOT NULL);


--
-- Name: idx_orders_gclid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_gclid ON public.orders USING btree (created_at) WHERE (gclid IS NOT NULL);


--
-- Name: idx_orders_partner_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_partner_code ON public.orders USING btree (partner_code) WHERE (partner_code IS NOT NULL);


--
-- Name: idx_orders_review_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_review_token ON public.orders USING btree (review_token);


--
-- Name: idx_orders_telegram; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_telegram ON public.orders USING btree (telegram_chat_id) WHERE (telegram_chat_id IS NOT NULL);


--
-- Name: idx_orders_utm_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_utm_source ON public.orders USING btree (utm_source) WHERE (utm_source IS NOT NULL);


--
-- Name: idx_payments_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_date ON public.acc_payments USING btree (payment_date DESC);


--
-- Name: idx_payments_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_order ON public.acc_payments USING btree (order_id);


--
-- Name: idx_payments_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_supplier ON public.acc_payments USING btree (supplier_id);


--
-- Name: idx_payments_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_type ON public.acc_payments USING btree (payment_type, status);


--
-- Name: idx_pbt_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pbt_customer ON public.partner_balance_transactions USING btree (customer_id, created_at DESC);


--
-- Name: idx_pending_card_orders_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pending_card_orders_created_at ON public.pending_card_orders USING btree (created_at);


--
-- Name: idx_pending_card_orders_reference; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pending_card_orders_reference ON public.pending_card_orders USING btree (reference);


--
-- Name: idx_pos_sessions_open; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_sessions_open ON public.pos_sessions USING btree (terminal_id) WHERE (status = 'open'::text);


--
-- Name: idx_pos_sessions_terminal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_sessions_terminal ON public.pos_sessions USING btree (terminal_id, opened_at DESC);


--
-- Name: idx_price_history_sku; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_price_history_sku ON public.price_history USING btree (sku, price_type, changed_at DESC);


--
-- Name: idx_pricing_rules_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_rules_lookup ON public.pricing_rules USING btree (marketplace, scope) WHERE is_active;


--
-- Name: idx_pricing_rules_sku; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_rules_sku ON public.pricing_rules USING btree (sku) WHERE ((sku IS NOT NULL) AND is_active);


--
-- Name: idx_product_faq_sku; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_faq_sku ON public.product_faq USING btree (product_sku);


--
-- Name: idx_product_prices_sku; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_prices_sku ON public.product_prices USING btree (sku, price_list_id);


--
-- Name: idx_products_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_active ON public.products USING btree (is_active);


--
-- Name: idx_products_brand; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_brand ON public.products USING btree (brand);


--
-- Name: idx_products_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_category ON public.products USING btree (category_slug);


--
-- Name: idx_products_variant_main; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_variant_main ON public.products USING btree (variant_main_sku) WHERE (variant_main_sku IS NOT NULL);


--
-- Name: idx_prom_attr_values_attr; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prom_attr_values_attr ON public.prom_attribute_values USING btree (prom_attribute_id);


--
-- Name: idx_prom_attributes_cat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prom_attributes_cat ON public.prom_attributes USING btree (prom_category_id);


--
-- Name: idx_promo_codes_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promo_codes_active ON public.promo_codes USING btree (code) WHERE (is_active = true);


--
-- Name: idx_promo_codes_validity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promo_codes_validity ON public.promo_codes USING btree (valid_until) WHERE (is_active = true);


--
-- Name: idx_promo_uses_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promo_uses_customer ON public.promo_code_uses USING btree (customer_id);


--
-- Name: idx_promo_uses_promo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_promo_uses_promo ON public.promo_code_uses USING btree (promo_id);


--
-- Name: idx_queue_one_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_queue_one_pending ON public.marketplace_sync_queue USING btree (listing_id, sync_type) WHERE (status = 'pending'::text);


--
-- Name: idx_queue_processable; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_queue_processable ON public.marketplace_sync_queue USING btree (marketplace_id, queued_at) WHERE (status = ANY (ARRAY['pending'::text, 'error'::text]));


--
-- Name: idx_reservations_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservations_active ON public.stock_reservations USING btree (sku, warehouse_id) WHERE (released_at IS NULL);


--
-- Name: idx_reservations_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservations_expires ON public.stock_reservations USING btree (expires_at) WHERE ((reservation_status = 'active'::text) AND (expires_at IS NOT NULL));


--
-- Name: idx_reservations_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservations_order ON public.stock_reservations USING btree (order_id);


--
-- Name: idx_rz_brackets_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rz_brackets_lookup ON public.rozetka_commission_brackets USING btree (rz_id, brand, price_from, price_to);


--
-- Name: idx_search_demand_cat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_search_demand_cat ON public.search_demand USING btree (category_slug, lang);


--
-- Name: idx_seo_actions_page; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_seo_actions_page ON public.seo_actions USING btree (page_path, created_at DESC);


--
-- Name: idx_seo_actions_recent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_seo_actions_recent ON public.seo_actions USING btree (created_at DESC);


--
-- Name: idx_sku_map_our_sku; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sku_map_our_sku ON public.supplier_sku_map USING btree (our_sku);


--
-- Name: idx_spa_charge; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_spa_charge ON public.supplier_payment_allocations USING btree (charge_entry_id);


--
-- Name: idx_spa_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_spa_payment ON public.supplier_payment_allocations USING btree (payment_entry_id);


--
-- Name: idx_stock_sku; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_sku ON public.product_stock USING btree (sku);


--
-- Name: idx_supplier_stock_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_stock_lookup ON public.supplier_stock USING btree (supplier_id, stock_status);


--
-- Name: idx_supplier_stock_sku; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_stock_sku ON public.supplier_stock USING btree (sku, stock_status);


--
-- Name: idx_supplier_sync_log_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supplier_sync_log_supplier ON public.supplier_sync_log USING btree (supplier_id, started_at DESC);


--
-- Name: idx_sync_log_errors; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sync_log_errors ON public.marketplace_sync_log USING btree (marketplace_id, sync_type) WHERE (status = ANY (ARRAY['error'::text, 'partial'::text]));


--
-- Name: idx_sync_log_marketplace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sync_log_marketplace ON public.marketplace_sync_log USING btree (marketplace_id, started_at DESC);


--
-- Name: idx_webhook_events_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_events_pending ON public.webhook_events USING btree (source, received_at) WHERE (status = 'pending'::text);


--
-- Name: idx_webhook_events_retry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_events_retry ON public.webhook_events USING btree (retry_after) WHERE ((status = 'failed'::text) AND (attempts < max_attempts));


--
-- Name: idx_webhook_events_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_webhook_events_unique ON public.webhook_events USING btree (source, external_event_id) WHERE (external_event_id IS NOT NULL);


--
-- Name: market_price_checks_delta_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX market_price_checks_delta_idx ON public.market_price_checks USING btree (delta_pct DESC NULLS LAST);


--
-- Name: market_price_checks_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX market_price_checks_status_idx ON public.market_price_checks USING btree (status);


--
-- Name: mono_bank_txns_dir_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mono_bank_txns_dir_status_idx ON public.mono_bank_txns USING btree (direction, status);


--
-- Name: mono_bank_txns_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mono_bank_txns_order_idx ON public.mono_bank_txns USING btree (matched_order_id);


--
-- Name: mono_bank_txns_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mono_bank_txns_status_idx ON public.mono_bank_txns USING btree (status);


--
-- Name: mono_bank_txns_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mono_bank_txns_time_idx ON public.mono_bank_txns USING btree (txn_time DESC);


--
-- Name: novapay_txns_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX novapay_txns_date_idx ON public.novapay_txns USING btree (txn_date DESC);


--
-- Name: novapay_txns_kind_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX novapay_txns_kind_idx ON public.novapay_txns USING btree (kind);


--
-- Name: novapay_txns_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX novapay_txns_status_idx ON public.novapay_txns USING btree (status);


--
-- Name: order_edits_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_edits_at_idx ON public.order_edits USING btree (at DESC);


--
-- Name: order_edits_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_edits_order_idx ON public.order_edits USING btree (order_id, at DESC);


--
-- Name: orders_channel_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_channel_code_idx ON public.orders USING btree (channel_code) WHERE (channel_code IS NOT NULL);


--
-- Name: orders_contract_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_contract_id_idx ON public.orders USING btree (contract_id);


--
-- Name: orders_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_created_at_idx ON public.orders USING btree (created_at DESC);


--
-- Name: orders_epicentr_order_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX orders_epicentr_order_id_key ON public.orders USING btree (epicentr_order_id) WHERE (epicentr_order_id IS NOT NULL);


--
-- Name: orders_order_number_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX orders_order_number_key ON public.orders USING btree (order_number);


--
-- Name: orders_payment_method_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_payment_method_idx ON public.orders USING btree (payment_method_code, status, created_at DESC);


--
-- Name: orders_payment_reference_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX orders_payment_reference_key ON public.orders USING btree (payment_reference);


--
-- Name: orders_prom_order_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX orders_prom_order_id_idx ON public.orders USING btree (prom_order_id) WHERE (prom_order_id IS NOT NULL);


--
-- Name: orders_rozetka_order_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX orders_rozetka_order_id_key ON public.orders USING btree (rozetka_order_id) WHERE (rozetka_order_id IS NOT NULL);


--
-- Name: orders_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_status_created_idx ON public.orders USING btree (status, created_at DESC);


--
-- Name: orders_tracking_number_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orders_tracking_number_idx ON public.orders USING btree (tracking_number) WHERE (tracking_number IS NOT NULL);


--
-- Name: partner_balance_tx_external_ref_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX partner_balance_tx_external_ref_key ON public.partner_balance_transactions USING btree (external_ref);


--
-- Name: price_lists_one_default; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX price_lists_one_default ON public.price_lists USING btree (type) WHERE (is_default = true);


--
-- Name: product_characteristics_product_sku_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_characteristics_product_sku_idx ON public.product_characteristics USING btree (product_sku);


--
-- Name: product_faq_product_sku_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_faq_product_sku_idx ON public.product_faq USING btree (product_sku);


--
-- Name: product_reviews_is_approved_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_reviews_is_approved_created_at_idx ON public.product_reviews USING btree (is_approved, created_at DESC);


--
-- Name: product_reviews_product_sku_is_approved_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX product_reviews_product_sku_is_approved_idx ON public.product_reviews USING btree (product_sku, is_approved);


--
-- Name: showcase_items_surface_position_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX showcase_items_surface_position_idx ON public.showcase_items USING btree (surface, "position");


--
-- Name: supplier_contracts_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX supplier_contracts_status_idx ON public.supplier_contracts USING btree (status);


--
-- Name: supplier_contracts_supplier_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX supplier_contracts_supplier_id_idx ON public.supplier_contracts USING btree (supplier_id);


--
-- Name: uq_money_entries_sale_shipment; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_money_entries_sale_shipment ON public.money_entries USING btree (doc_id) WHERE ((doc_id IS NOT NULL) AND (account_type = 'customer'::text) AND (amount > (0)::numeric));


--
-- Name: uq_pricing_rules_band; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_pricing_rules_band ON public.pricing_rules USING btree (marketplace, cost_from) WHERE ((scope = 'cost_band'::text) AND is_active);


--
-- Name: uq_pricing_rules_brand_cat; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_pricing_rules_brand_cat ON public.pricing_rules USING btree (marketplace, category_slug, brand) WHERE ((scope = 'brand_category'::text) AND is_active);


--
-- Name: uq_pricing_rules_category; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_pricing_rules_category ON public.pricing_rules USING btree (marketplace, category_slug) WHERE ((scope = 'category'::text) AND is_active);


--
-- Name: uq_pricing_rules_global; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_pricing_rules_global ON public.pricing_rules USING btree (marketplace) WHERE ((scope = 'global'::text) AND is_active);


--
-- Name: uq_pricing_rules_product; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_pricing_rules_product ON public.pricing_rules USING btree (marketplace, sku) WHERE ((scope = 'product'::text) AND is_active);


--
-- Name: uq_product_characteristics_sku_label; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_product_characteristics_sku_label ON public.product_characteristics USING btree (product_sku, label);


--
-- Name: warehouses_one_default; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX warehouses_one_default ON public.warehouses USING btree (is_default) WHERE (is_default = true);


--
-- Name: products products_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: product_stock stock_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER stock_updated_at BEFORE UPDATE ON public.product_stock FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: stock_batches trg_batch_avg_cost_sync; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_batch_avg_cost_sync AFTER UPDATE OF remaining_qty, cost_price ON public.stock_batches FOR EACH ROW EXECUTE FUNCTION public.fn_batch_avg_cost_sync();


--
-- Name: stock_balance trg_clear_price_lock_on_empty_stock; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_clear_price_lock_on_empty_stock AFTER UPDATE OF qty_total ON public.stock_balance FOR EACH ROW WHEN (((new.qty_total = (0)::numeric) AND (old.qty_total > (0)::numeric))) EXECUTE FUNCTION public.fn_clear_price_lock_on_empty_stock();


--
-- Name: suppliers trg_create_supplier_warehouse; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_create_supplier_warehouse AFTER INSERT ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.fn_create_supplier_warehouse();


--
-- Name: customers trg_customers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: money_entries trg_guard_money_entries; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_money_entries BEFORE DELETE OR UPDATE ON public.money_entries FOR EACH ROW EXECUTE FUNCTION public.fn_guard_money_entries();


--
-- Name: stock_movements trg_guard_movements_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_movements_delete BEFORE DELETE ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.fn_guard_stock_movements();


--
-- Name: stock_movements trg_guard_movements_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guard_movements_update BEFORE UPDATE ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.fn_guard_stock_movements();


--
-- Name: money_entries trg_money_entries_period_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_money_entries_period_guard BEFORE INSERT ON public.money_entries FOR EACH ROW EXECUTE FUNCTION public.fn_guard_closed_period();


--
-- Name: orders trg_order_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_order_number BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.fn_generate_order_number();


--
-- Name: orders trg_order_status_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_order_status_history AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.fn_track_order_status();


--
-- Name: acc_documents trg_po_status_on_receipt; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_po_status_on_receipt AFTER UPDATE ON public.acc_documents FOR EACH ROW EXECUTE FUNCTION public.fn_update_po_status_on_receipt();


--
-- Name: product_stock trg_price_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_price_history AFTER UPDATE ON public.product_stock FOR EACH ROW EXECUTE FUNCTION public.fn_track_price_history();


--
-- Name: price_history trg_price_to_marketplace_queue; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_price_to_marketplace_queue AFTER INSERT ON public.price_history FOR EACH ROW EXECUTE FUNCTION public.fn_queue_price_sync();


--
-- Name: product_prices trg_product_prices_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_product_prices_updated_at BEFORE UPDATE ON public.product_prices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: promo_code_uses trg_promo_uses_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_promo_uses_count AFTER INSERT ON public.promo_code_uses FOR EACH ROW EXECUTE FUNCTION public.fn_increment_promo_uses();


--
-- Name: stock_movements trg_stock_balance_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_stock_balance_update AFTER INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.fn_update_stock_balance();


--
-- Name: stock_reservations trg_stock_reserved_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_stock_reserved_update AFTER INSERT OR UPDATE ON public.stock_reservations FOR EACH ROW EXECUTE FUNCTION public.fn_update_stock_reserved();


--
-- Name: stock_balance trg_stock_to_marketplace_queue; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_stock_to_marketplace_queue AFTER UPDATE ON public.stock_balance FOR EACH ROW EXECUTE FUNCTION public.fn_queue_stock_sync();


--
-- Name: supplier_stock trg_supplier_stock_to_product; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_supplier_stock_to_product AFTER INSERT OR UPDATE ON public.supplier_stock FOR EACH ROW EXECUTE FUNCTION public.fn_supplier_stock_changed();


--
-- Name: customers trg_sync_customer_name_to_contracts; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_customer_name_to_contracts AFTER UPDATE OF name, company, legal_name ON public.customers FOR EACH ROW EXECUTE FUNCTION public.sync_customer_name_to_contracts();


--
-- Name: money_entries trg_update_balance; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_update_balance AFTER INSERT ON public.money_entries FOR EACH ROW EXECUTE FUNCTION public.fn_update_counterparty_balance();


--
-- Name: partner_balance_transactions trg_update_partner_balance; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_update_partner_balance AFTER INSERT ON public.partner_balance_transactions FOR EACH ROW EXECUTE FUNCTION public.fn_update_partner_balance();


--
-- Name: acc_doc_sequences acc_doc_sequences_doc_type_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_doc_sequences
    ADD CONSTRAINT acc_doc_sequences_doc_type_fkey FOREIGN KEY (doc_type) REFERENCES public.acc_doc_types(code);


--
-- Name: acc_document_lines acc_document_lines_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_document_lines
    ADD CONSTRAINT acc_document_lines_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.acc_documents(id) ON DELETE CASCADE;


--
-- Name: acc_document_lines acc_document_lines_po_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_document_lines
    ADD CONSTRAINT acc_document_lines_po_line_id_fkey FOREIGN KEY (po_line_id) REFERENCES public.acc_document_lines(id) ON DELETE SET NULL;


--
-- Name: acc_document_lines acc_document_lines_sku_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_document_lines
    ADD CONSTRAINT acc_document_lines_sku_fkey FOREIGN KEY (sku) REFERENCES public.products(sku);


--
-- Name: acc_document_lines acc_document_lines_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_document_lines
    ADD CONSTRAINT acc_document_lines_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: acc_document_lines acc_document_lines_uom_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_document_lines
    ADD CONSTRAINT acc_document_lines_uom_code_fkey FOREIGN KEY (uom_code) REFERENCES public.uom(code);


--
-- Name: acc_document_lines acc_document_lines_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_document_lines
    ADD CONSTRAINT acc_document_lines_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: acc_documents acc_documents_channel_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_documents
    ADD CONSTRAINT acc_documents_channel_code_fkey FOREIGN KEY (channel_code) REFERENCES public.sales_channels(code);


--
-- Name: acc_documents acc_documents_contract_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_documents
    ADD CONSTRAINT acc_documents_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.customer_contracts(id);


--
-- Name: acc_documents acc_documents_currency_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_documents
    ADD CONSTRAINT acc_documents_currency_fkey FOREIGN KEY (currency) REFERENCES public.currencies(code);


--
-- Name: acc_documents acc_documents_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_documents
    ADD CONSTRAINT acc_documents_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: acc_documents acc_documents_doc_type_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_documents
    ADD CONSTRAINT acc_documents_doc_type_fkey FOREIGN KEY (doc_type) REFERENCES public.acc_doc_types(code);


--
-- Name: acc_documents acc_documents_parent_doc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_documents
    ADD CONSTRAINT acc_documents_parent_doc_id_fkey FOREIGN KEY (parent_doc_id) REFERENCES public.acc_documents(id) ON DELETE SET NULL;


--
-- Name: acc_documents acc_documents_reversal_of_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_documents
    ADD CONSTRAINT acc_documents_reversal_of_fkey FOREIGN KEY (reversal_of) REFERENCES public.acc_documents(id);


--
-- Name: acc_documents acc_documents_supplier_contract_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_documents
    ADD CONSTRAINT acc_documents_supplier_contract_id_fkey FOREIGN KEY (supplier_contract_id) REFERENCES public.supplier_contracts(id) ON DELETE SET NULL;


--
-- Name: acc_documents acc_documents_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_documents
    ADD CONSTRAINT acc_documents_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: acc_documents acc_documents_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_documents
    ADD CONSTRAINT acc_documents_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: acc_documents acc_documents_warehouse_to_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_documents
    ADD CONSTRAINT acc_documents_warehouse_to_id_fkey FOREIGN KEY (warehouse_to_id) REFERENCES public.warehouses(id);


--
-- Name: acc_expenses acc_expenses_category_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_expenses
    ADD CONSTRAINT acc_expenses_category_fkey FOREIGN KEY (category) REFERENCES public.acc_expense_categories(code);


--
-- Name: acc_expenses acc_expenses_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_expenses
    ADD CONSTRAINT acc_expenses_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES public.acc_payments(id);


--
-- Name: acc_payments acc_payments_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_payments
    ADD CONSTRAINT acc_payments_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.acc_documents(id);


--
-- Name: acc_payments acc_payments_payment_method_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_payments
    ADD CONSTRAINT acc_payments_payment_method_fkey FOREIGN KEY (payment_method) REFERENCES public.acc_payment_methods(code);


--
-- Name: acc_payments acc_payments_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_payments
    ADD CONSTRAINT acc_payments_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: ads_conversions ads_conversions_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ads_conversions
    ADD CONSTRAINT ads_conversions_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: ar_corrections ar_corrections_from_contract_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ar_corrections
    ADD CONSTRAINT ar_corrections_from_contract_id_fkey FOREIGN KEY (from_contract_id) REFERENCES public.customer_contracts(id);


--
-- Name: ar_corrections ar_corrections_to_contract_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ar_corrections
    ADD CONSTRAINT ar_corrections_to_contract_id_fkey FOREIGN KEY (to_contract_id) REFERENCES public.customer_contracts(id);


--
-- Name: categories categories_parent_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_parent_slug_fkey FOREIGN KEY (parent_slug) REFERENCES public.categories(slug);


--
-- Name: category_characteristics category_characteristics_definition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.category_characteristics
    ADD CONSTRAINT category_characteristics_definition_id_fkey FOREIGN KEY (definition_id) REFERENCES public.characteristic_definitions(id) ON DELETE CASCADE;


--
-- Name: characteristic_values characteristic_values_definition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.characteristic_values
    ADD CONSTRAINT characteristic_values_definition_id_fkey FOREIGN KEY (definition_id) REFERENCES public.characteristic_definitions(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.chat_sessions(id) ON DELETE CASCADE;


--
-- Name: customer_notifications customer_notifications_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_notifications
    ADD CONSTRAINT customer_notifications_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: customer_price_rules customer_price_rules_category_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_price_rules
    ADD CONSTRAINT customer_price_rules_category_slug_fkey FOREIGN KEY (category_slug) REFERENCES public.categories(slug);


--
-- Name: customer_price_rules customer_price_rules_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_price_rules
    ADD CONSTRAINT customer_price_rules_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: customer_price_rules customer_price_rules_price_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_price_rules
    ADD CONSTRAINT customer_price_rules_price_list_id_fkey FOREIGN KEY (price_list_id) REFERENCES public.price_lists(id);


--
-- Name: customer_price_rules customer_price_rules_sku_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_price_rules
    ADD CONSTRAINT customer_price_rules_sku_fkey FOREIGN KEY (sku) REFERENCES public.products(sku);


--
-- Name: customers customers_price_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_price_list_id_fkey FOREIGN KEY (price_list_id) REFERENCES public.price_lists(id);


--
-- Name: debt_adjustment_lines debt_adjustment_lines_credit_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debt_adjustment_lines
    ADD CONSTRAINT debt_adjustment_lines_credit_order_id_fkey FOREIGN KEY (credit_order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: debt_adjustment_lines debt_adjustment_lines_debit_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debt_adjustment_lines
    ADD CONSTRAINT debt_adjustment_lines_debit_order_id_fkey FOREIGN KEY (debit_order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: debt_adjustment_lines debt_adjustment_lines_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.debt_adjustment_lines
    ADD CONSTRAINT debt_adjustment_lines_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.acc_documents(id) ON DELETE CASCADE;


--
-- Name: exchange_rates exchange_rates_currency_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rates
    ADD CONSTRAINT exchange_rates_currency_fkey FOREIGN KEY (currency) REFERENCES public.currencies(code);


--
-- Name: acc_documents fk_acc_doc_mp_order; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.acc_documents
    ADD CONSTRAINT fk_acc_doc_mp_order FOREIGN KEY (marketplace_order_id) REFERENCES public.marketplace_orders(id);


--
-- Name: money_entries fk_money_contract; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.money_entries
    ADD CONSTRAINT fk_money_contract FOREIGN KEY (contract_id) REFERENCES public.customer_contracts(id) ON DELETE SET NULL;


--
-- Name: fulfillment_rules fulfillment_rules_category_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fulfillment_rules
    ADD CONSTRAINT fulfillment_rules_category_slug_fkey FOREIGN KEY (category_slug) REFERENCES public.categories(slug);


--
-- Name: fulfillment_rules fulfillment_rules_channel_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fulfillment_rules
    ADD CONSTRAINT fulfillment_rules_channel_code_fkey FOREIGN KEY (channel_code) REFERENCES public.sales_channels(code);


--
-- Name: fulfillment_rules fulfillment_rules_sku_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fulfillment_rules
    ADD CONSTRAINT fulfillment_rules_sku_fkey FOREIGN KEY (sku) REFERENCES public.products(sku);


--
-- Name: fulfillment_rules fulfillment_rules_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fulfillment_rules
    ADD CONSTRAINT fulfillment_rules_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: landed_cost_lines landed_cost_lines_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.landed_cost_lines
    ADD CONSTRAINT landed_cost_lines_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.acc_documents(id) ON DELETE CASCADE;


--
-- Name: market_price_checks market_price_checks_sku_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.market_price_checks
    ADD CONSTRAINT market_price_checks_sku_fkey FOREIGN KEY (sku) REFERENCES public.products(sku);


--
-- Name: marketplace_accounts marketplace_accounts_channel_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_accounts
    ADD CONSTRAINT marketplace_accounts_channel_code_fkey FOREIGN KEY (channel_code) REFERENCES public.sales_channels(code);


--
-- Name: marketplace_accounts marketplace_accounts_price_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_accounts
    ADD CONSTRAINT marketplace_accounts_price_list_id_fkey FOREIGN KEY (price_list_id) REFERENCES public.price_lists(id);


--
-- Name: marketplace_listings marketplace_listings_marketplace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_listings
    ADD CONSTRAINT marketplace_listings_marketplace_id_fkey FOREIGN KEY (marketplace_id) REFERENCES public.marketplace_accounts(id) ON DELETE CASCADE;


--
-- Name: marketplace_listings marketplace_listings_sku_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_listings
    ADD CONSTRAINT marketplace_listings_sku_fkey FOREIGN KEY (sku) REFERENCES public.products(sku);


--
-- Name: marketplace_orders marketplace_orders_marketplace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_orders
    ADD CONSTRAINT marketplace_orders_marketplace_id_fkey FOREIGN KEY (marketplace_id) REFERENCES public.marketplace_accounts(id);


--
-- Name: marketplace_refunds marketplace_refunds_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_refunds
    ADD CONSTRAINT marketplace_refunds_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: marketplace_status_map marketplace_status_map_marketplace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_status_map
    ADD CONSTRAINT marketplace_status_map_marketplace_id_fkey FOREIGN KEY (marketplace_id) REFERENCES public.marketplace_accounts(id) ON DELETE CASCADE;


--
-- Name: marketplace_sync_log marketplace_sync_log_marketplace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_sync_log
    ADD CONSTRAINT marketplace_sync_log_marketplace_id_fkey FOREIGN KEY (marketplace_id) REFERENCES public.marketplace_accounts(id);


--
-- Name: marketplace_sync_queue marketplace_sync_queue_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_sync_queue
    ADD CONSTRAINT marketplace_sync_queue_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.marketplace_listings(id) ON DELETE CASCADE;


--
-- Name: marketplace_sync_queue marketplace_sync_queue_marketplace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_sync_queue
    ADD CONSTRAINT marketplace_sync_queue_marketplace_id_fkey FOREIGN KEY (marketplace_id) REFERENCES public.marketplace_accounts(id);


--
-- Name: money_entries money_entries_doc_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.money_entries
    ADD CONSTRAINT money_entries_doc_id_fkey FOREIGN KEY (doc_id) REFERENCES public.acc_documents(id) ON DELETE SET NULL;


--
-- Name: money_entries money_entries_supplier_contract_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.money_entries
    ADD CONSTRAINT money_entries_supplier_contract_id_fkey FOREIGN KEY (supplier_contract_id) REFERENCES public.supplier_contracts(id) ON DELETE SET NULL;


--
-- Name: mono_bank_txns mono_bank_txns_matched_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mono_bank_txns
    ADD CONSTRAINT mono_bank_txns_matched_order_id_fkey FOREIGN KEY (matched_order_id) REFERENCES public.orders(id);


--
-- Name: order_payments order_payments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_payments
    ADD CONSTRAINT order_payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: orders orders_channel_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_channel_code_fkey FOREIGN KEY (channel_code) REFERENCES public.sales_channels(code);


--
-- Name: orders orders_contract_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.customer_contracts(id) ON DELETE SET NULL;


--
-- Name: orders orders_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: orders orders_promo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_promo_id_fkey FOREIGN KEY (promo_id) REFERENCES public.promo_codes(id);


--
-- Name: orders orders_shipping_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_shipping_supplier_id_fkey FOREIGN KEY (shipping_supplier_id) REFERENCES public.suppliers(id);


--
-- Name: orders orders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: partner_balance_transactions partner_balance_transactions_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_balance_transactions
    ADD CONSTRAINT partner_balance_transactions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: partner_payout_requests partner_payout_requests_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_payout_requests
    ADD CONSTRAINT partner_payout_requests_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: pending_card_orders pending_card_orders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_card_orders
    ADD CONSTRAINT pending_card_orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: pos_sessions pos_sessions_terminal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_sessions
    ADD CONSTRAINT pos_sessions_terminal_id_fkey FOREIGN KEY (terminal_id) REFERENCES public.pos_terminals(id);


--
-- Name: pos_terminals pos_terminals_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_terminals
    ADD CONSTRAINT pos_terminals_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: price_change_log price_change_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_change_log
    ADD CONSTRAINT price_change_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: price_history price_history_sku_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_history
    ADD CONSTRAINT price_history_sku_fkey FOREIGN KEY (sku) REFERENCES public.products(sku);


--
-- Name: pricing_rules pricing_rules_category_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_rules
    ADD CONSTRAINT pricing_rules_category_slug_fkey FOREIGN KEY (category_slug) REFERENCES public.categories(slug) ON DELETE CASCADE;


--
-- Name: pricing_rules pricing_rules_sku_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_rules
    ADD CONSTRAINT pricing_rules_sku_fkey FOREIGN KEY (sku) REFERENCES public.products(sku) ON DELETE CASCADE;


--
-- Name: product_characteristics product_characteristics_product_sku_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_characteristics
    ADD CONSTRAINT product_characteristics_product_sku_fkey FOREIGN KEY (product_sku) REFERENCES public.products(sku) ON DELETE CASCADE;


--
-- Name: product_faq product_faq_product_sku_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_faq
    ADD CONSTRAINT product_faq_product_sku_fkey FOREIGN KEY (product_sku) REFERENCES public.products(sku) ON DELETE CASCADE;


--
-- Name: product_prices product_prices_price_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_prices
    ADD CONSTRAINT product_prices_price_list_id_fkey FOREIGN KEY (price_list_id) REFERENCES public.price_lists(id) ON DELETE CASCADE;


--
-- Name: product_prices product_prices_sku_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_prices
    ADD CONSTRAINT product_prices_sku_fkey FOREIGN KEY (sku) REFERENCES public.products(sku) ON DELETE CASCADE;


--
-- Name: product_reviews product_reviews_product_sku_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reviews
    ADD CONSTRAINT product_reviews_product_sku_fkey FOREIGN KEY (product_sku) REFERENCES public.products(sku) ON DELETE CASCADE;


--
-- Name: product_stock product_stock_sku_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_stock
    ADD CONSTRAINT product_stock_sku_fkey FOREIGN KEY (sku) REFERENCES public.products(sku) ON DELETE CASCADE;


--
-- Name: products products_base_uom_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_base_uom_fkey FOREIGN KEY (base_uom) REFERENCES public.uom(code);


--
-- Name: products products_category_slug_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_category_slug_fkey FOREIGN KEY (category_slug) REFERENCES public.categories(slug);


--
-- Name: products products_purchase_uom_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_purchase_uom_fkey FOREIGN KEY (purchase_uom) REFERENCES public.uom(code);


--
-- Name: products products_sale_uom_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_sale_uom_fkey FOREIGN KEY (sale_uom) REFERENCES public.uom(code);


--
-- Name: prom_attribute_values prom_attribute_values_prom_attribute_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prom_attribute_values
    ADD CONSTRAINT prom_attribute_values_prom_attribute_id_fkey FOREIGN KEY (prom_attribute_id) REFERENCES public.prom_attributes(id) ON DELETE CASCADE;


--
-- Name: promo_code_uses promo_code_uses_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_code_uses
    ADD CONSTRAINT promo_code_uses_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: promo_code_uses promo_code_uses_promo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promo_code_uses
    ADD CONSTRAINT promo_code_uses_promo_id_fkey FOREIGN KEY (promo_id) REFERENCES public.promo_codes(id);


--
-- Name: search_queries search_queries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_queries
    ADD CONSTRAINT search_queries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: showcase_items showcase_items_sku_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.showcase_items
    ADD CONSTRAINT showcase_items_sku_fkey FOREIGN KEY (sku) REFERENCES public.products(sku) ON DELETE CASCADE;


--
-- Name: stock_balance stock_balance_sku_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_balance
    ADD CONSTRAINT stock_balance_sku_fkey FOREIGN KEY (sku) REFERENCES public.products(sku);


--
-- Name: stock_balance stock_balance_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_balance
    ADD CONSTRAINT stock_balance_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: stock_batches stock_batches_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_batches
    ADD CONSTRAINT stock_batches_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.acc_documents(id) ON DELETE SET NULL;


--
-- Name: stock_batches stock_batches_sku_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_batches
    ADD CONSTRAINT stock_batches_sku_fkey FOREIGN KEY (sku) REFERENCES public.products(sku) ON DELETE CASCADE;


--
-- Name: stock_batches stock_batches_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_batches
    ADD CONSTRAINT stock_batches_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: stock_batches stock_batches_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_batches
    ADD CONSTRAINT stock_batches_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: stock_movements stock_movements_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.acc_documents(id);


--
-- Name: stock_movements stock_movements_document_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_document_line_id_fkey FOREIGN KEY (document_line_id) REFERENCES public.acc_document_lines(id);


--
-- Name: stock_movements stock_movements_sku_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_sku_fkey FOREIGN KEY (sku) REFERENCES public.products(sku);


--
-- Name: stock_movements stock_movements_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: stock_movements stock_movements_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: stock_reservations stock_reservations_sku_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_reservations
    ADD CONSTRAINT stock_reservations_sku_fkey FOREIGN KEY (sku) REFERENCES public.products(sku);


--
-- Name: stock_reservations stock_reservations_warehouse_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_reservations
    ADD CONSTRAINT stock_reservations_warehouse_id_fkey FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id);


--
-- Name: supplier_brand_discounts supplier_brand_discounts_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_brand_discounts
    ADD CONSTRAINT supplier_brand_discounts_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;


--
-- Name: supplier_contracts supplier_contracts_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_contracts
    ADD CONSTRAINT supplier_contracts_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;


--
-- Name: supplier_payment_allocations supplier_payment_allocations_charge_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_payment_allocations
    ADD CONSTRAINT supplier_payment_allocations_charge_entry_id_fkey FOREIGN KEY (charge_entry_id) REFERENCES public.money_entries(id) ON DELETE CASCADE;


--
-- Name: supplier_payment_allocations supplier_payment_allocations_payment_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_payment_allocations
    ADD CONSTRAINT supplier_payment_allocations_payment_entry_id_fkey FOREIGN KEY (payment_entry_id) REFERENCES public.money_entries(id) ON DELETE CASCADE;


--
-- Name: supplier_product_overrides supplier_product_overrides_our_sku_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_product_overrides
    ADD CONSTRAINT supplier_product_overrides_our_sku_fkey FOREIGN KEY (our_sku) REFERENCES public.products(sku) ON DELETE CASCADE;


--
-- Name: supplier_product_overrides supplier_product_overrides_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_product_overrides
    ADD CONSTRAINT supplier_product_overrides_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;


--
-- Name: supplier_promotions supplier_promotions_our_sku_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_promotions
    ADD CONSTRAINT supplier_promotions_our_sku_fkey FOREIGN KEY (our_sku) REFERENCES public.products(sku) ON DELETE CASCADE;


--
-- Name: supplier_promotions supplier_promotions_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_promotions
    ADD CONSTRAINT supplier_promotions_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;


--
-- Name: supplier_sku_map supplier_sku_map_our_sku_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_sku_map
    ADD CONSTRAINT supplier_sku_map_our_sku_fkey FOREIGN KEY (our_sku) REFERENCES public.products(sku) ON DELETE CASCADE;


--
-- Name: supplier_sku_map supplier_sku_map_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_sku_map
    ADD CONSTRAINT supplier_sku_map_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;


--
-- Name: supplier_stock supplier_stock_sku_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_stock
    ADD CONSTRAINT supplier_stock_sku_fkey FOREIGN KEY (sku) REFERENCES public.products(sku) ON DELETE CASCADE;


--
-- Name: supplier_stock supplier_stock_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_stock
    ADD CONSTRAINT supplier_stock_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;


--
-- Name: supplier_sync_log supplier_sync_log_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_sync_log
    ADD CONSTRAINT supplier_sync_log_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;


--
-- Name: supplier_unmapped_skus supplier_unmapped_skus_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_unmapped_skus
    ADD CONSTRAINT supplier_unmapped_skus_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;


--
-- Name: uom_conversions uom_conversions_from_uom_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uom_conversions
    ADD CONSTRAINT uom_conversions_from_uom_fkey FOREIGN KEY (from_uom) REFERENCES public.uom(code);


--
-- Name: uom_conversions uom_conversions_sku_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uom_conversions
    ADD CONSTRAINT uom_conversions_sku_fkey FOREIGN KEY (sku) REFERENCES public.products(sku) ON DELETE CASCADE;


--
-- Name: uom_conversions uom_conversions_to_uom_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uom_conversions
    ADD CONSTRAINT uom_conversions_to_uom_fkey FOREIGN KEY (to_uom) REFERENCES public.uom(code);


--
-- Name: warehouses warehouses_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: webhook_events webhook_events_related_marketplace_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_events
    ADD CONSTRAINT webhook_events_related_marketplace_order_id_fkey FOREIGN KEY (related_marketplace_order_id) REFERENCES public.marketplace_orders(id);


--
-- Name: wishlists wishlists_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wishlists
    ADD CONSTRAINT wishlists_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: orders Admins can update orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update orders" ON public.orders FOR UPDATE TO authenticated USING ((((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text));


--
-- Name: orders Admins can view all orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all orders" ON public.orders FOR SELECT TO authenticated USING ((((( SELECT auth.jwt() AS jwt) -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text));


--
-- Name: orders Allow guest order inserts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow guest order inserts" ON public.orders FOR INSERT TO anon WITH CHECK ((user_id IS NULL));


--
-- Name: orders Users can insert own orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own orders" ON public.orders FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: orders Users can view own orders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own orders" ON public.orders FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: abandoned_carts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.abandoned_carts ENABLE ROW LEVEL SECURITY;

--
-- Name: acc_doc_sequences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.acc_doc_sequences ENABLE ROW LEVEL SECURITY;

--
-- Name: acc_doc_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.acc_doc_types ENABLE ROW LEVEL SECURITY;

--
-- Name: acc_document_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.acc_document_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: acc_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.acc_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: acc_expense_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.acc_expense_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: acc_expenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.acc_expenses ENABLE ROW LEVEL SECURITY;

--
-- Name: acc_payment_methods; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.acc_payment_methods ENABLE ROW LEVEL SECURITY;

--
-- Name: acc_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.acc_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: acc_periods; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.acc_periods ENABLE ROW LEVEL SECURITY;

--
-- Name: price_change_log admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_all ON public.price_change_log USING ((((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text)) WITH CHECK ((((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = 'admin'::text));


--
-- Name: ads_conversions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ads_conversions ENABLE ROW LEVEL SECURITY;

--
-- Name: ads_spend; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ads_spend ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_agent_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_agent_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_bot_hits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_bot_hits ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_referrals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_referrals ENABLE ROW LEVEL SECURITY;

--
-- Name: alert_throttle; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.alert_throttle ENABLE ROW LEVEL SECURITY;

--
-- Name: app_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: ar_corrections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ar_corrections ENABLE ROW LEVEL SECURITY;

--
-- Name: blog_posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

--
-- Name: blog_posts blog_posts_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY blog_posts_public_read ON public.blog_posts FOR SELECT TO authenticated, anon USING ((is_published = true));


--
-- Name: brand_logos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.brand_logos ENABLE ROW LEVEL SECURITY;

--
-- Name: brand_logos brand_logos public read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "brand_logos public read" ON public.brand_logos FOR SELECT TO authenticated, anon USING (true);


--
-- Name: categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

--
-- Name: categories categories_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categories_public_read ON public.categories FOR SELECT USING (true);


--
-- Name: category_characteristics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.category_characteristics ENABLE ROW LEVEL SECURITY;

--
-- Name: category_content; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.category_content ENABLE ROW LEVEL SECURITY;

--
-- Name: category_content category_content_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY category_content_read ON public.category_content FOR SELECT USING (true);


--
-- Name: characteristic_definitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.characteristic_definitions ENABLE ROW LEVEL SECURITY;

--
-- Name: characteristic_values; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.characteristic_values ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: counterparty_balances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.counterparty_balances ENABLE ROW LEVEL SECURITY;

--
-- Name: currencies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_contracts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_contracts ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_price_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_price_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

--
-- Name: debt_adjustment_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.debt_adjustment_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: exchange_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: expenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

--
-- Name: fulfillment_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fulfillment_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: gsc_daily; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gsc_daily ENABLE ROW LEVEL SECURITY;

--
-- Name: acc_doc_sequences internal_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY internal_only ON public.acc_doc_sequences USING (false);


--
-- Name: acc_doc_types internal_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY internal_only ON public.acc_doc_types USING (false);


--
-- Name: acc_document_lines internal_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY internal_only ON public.acc_document_lines USING (false);


--
-- Name: acc_documents internal_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY internal_only ON public.acc_documents USING (false);


--
-- Name: acc_expense_categories internal_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY internal_only ON public.acc_expense_categories USING (false);


--
-- Name: acc_expenses internal_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY internal_only ON public.acc_expenses USING (false);


--
-- Name: acc_payment_methods internal_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY internal_only ON public.acc_payment_methods USING (false);


--
-- Name: acc_payments internal_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY internal_only ON public.acc_payments USING (false);


--
-- Name: acc_periods internal_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY internal_only ON public.acc_periods USING (false);


--
-- Name: ar_corrections internal_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY internal_only ON public.ar_corrections USING (false);


--
-- Name: counterparty_balances internal_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY internal_only ON public.counterparty_balances USING (false);


--
-- Name: customer_contracts internal_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY internal_only ON public.customer_contracts USING (false);


--
-- Name: debt_adjustment_lines internal_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY internal_only ON public.debt_adjustment_lines USING (false);


--
-- Name: expenses internal_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY internal_only ON public.expenses USING (false);


--
-- Name: landed_cost_lines internal_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY internal_only ON public.landed_cost_lines USING (false);


--
-- Name: money_entries internal_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY internal_only ON public.money_entries USING (false);


--
-- Name: order_edits internal_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY internal_only ON public.order_edits USING (false);


--
-- Name: price_history internal_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY internal_only ON public.price_history USING (false);


--
-- Name: search_queries internal_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY internal_only ON public.search_queries USING (false);


--
-- Name: stock_balance internal_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY internal_only ON public.stock_balance USING (false);


--
-- Name: stock_movements internal_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY internal_only ON public.stock_movements USING (false);


--
-- Name: stock_reservations internal_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY internal_only ON public.stock_reservations USING (false);


--
-- Name: supplier_stock internal_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY internal_only ON public.supplier_stock USING (false);


--
-- Name: uom_conversions internal_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY internal_only ON public.uom_conversions USING (false);


--
-- Name: warehouses internal_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY internal_only ON public.warehouses USING (false);


--
-- Name: landed_cost_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.landed_cost_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: mail_oauth_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mail_oauth_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: mail_read_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mail_read_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: mail_register_imports; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mail_register_imports ENABLE ROW LEVEL SECURITY;

--
-- Name: market_price_checks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.market_price_checks ENABLE ROW LEVEL SECURITY;

--
-- Name: marketplace_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketplace_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: marketplace_chat_drafts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketplace_chat_drafts ENABLE ROW LEVEL SECURITY;

--
-- Name: marketplace_chat_seen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketplace_chat_seen ENABLE ROW LEVEL SECURITY;

--
-- Name: marketplace_listings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;

--
-- Name: marketplace_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketplace_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: marketplace_refunds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketplace_refunds ENABLE ROW LEVEL SECURITY;

--
-- Name: marketplace_status_map; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketplace_status_map ENABLE ROW LEVEL SECURITY;

--
-- Name: marketplace_sync_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketplace_sync_log ENABLE ROW LEVEL SECURITY;

--
-- Name: marketplace_sync_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketplace_sync_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: money_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.money_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: mono_bank_txns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mono_bank_txns ENABLE ROW LEVEL SECURITY;

--
-- Name: novapay_txns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.novapay_txns ENABLE ROW LEVEL SECURITY;

--
-- Name: order_edits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_edits ENABLE ROW LEVEL SECURITY;

--
-- Name: order_number_seq; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_number_seq ENABLE ROW LEVEL SECURITY;

--
-- Name: order_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: order_status_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: partner_balance_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.partner_balance_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: partner_balance_transactions partner_no_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY partner_no_write ON public.partner_balance_transactions FOR INSERT WITH CHECK (false);


--
-- Name: partner_payout_requests partner_no_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY partner_no_write ON public.partner_payout_requests FOR INSERT WITH CHECK (false);


--
-- Name: partner_payout_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.partner_payout_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: partner_balance_transactions partner_read_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY partner_read_own ON public.partner_balance_transactions FOR SELECT USING ((customer_id = ( SELECT customers.id
   FROM public.customers
  WHERE (customers.auth_user_id = auth.uid()))));


--
-- Name: partner_payout_requests partner_read_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY partner_read_own ON public.partner_payout_requests FOR SELECT USING ((customer_id = ( SELECT customers.id
   FROM public.customers
  WHERE (customers.auth_user_id = auth.uid()))));


--
-- Name: pending_card_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pending_card_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: pos_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pos_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: pos_terminals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pos_terminals ENABLE ROW LEVEL SECURITY;

--
-- Name: price_change_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.price_change_log ENABLE ROW LEVEL SECURITY;

--
-- Name: price_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;

--
-- Name: price_lists; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.price_lists ENABLE ROW LEVEL SECURITY;

--
-- Name: pricing_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: product_characteristics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_characteristics ENABLE ROW LEVEL SECURITY;

--
-- Name: product_characteristics product_characteristics_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_characteristics_public_read ON public.product_characteristics FOR SELECT USING (true);


--
-- Name: product_faq; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_faq ENABLE ROW LEVEL SECURITY;

--
-- Name: product_faq product_faq_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_faq_public_read ON public.product_faq FOR SELECT TO authenticated, anon USING (true);


--
-- Name: product_prices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_prices ENABLE ROW LEVEL SECURITY;

--
-- Name: product_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: product_stock; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_stock ENABLE ROW LEVEL SECURITY;

--
-- Name: product_stock product_stock_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_stock_public_read ON public.product_stock FOR SELECT USING (true);


--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: products products_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY products_public_read ON public.products FOR SELECT USING (true);


--
-- Name: prom_attribute_values; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prom_attribute_values ENABLE ROW LEVEL SECURITY;

--
-- Name: prom_attributes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prom_attributes ENABLE ROW LEVEL SECURITY;

--
-- Name: prom_commissions_ref; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prom_commissions_ref ENABLE ROW LEVEL SECURITY;

--
-- Name: promo_code_uses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.promo_code_uses ENABLE ROW LEVEL SECURITY;

--
-- Name: promo_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: rozetka_category_tree; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rozetka_category_tree ENABLE ROW LEVEL SECURITY;

--
-- Name: rozetka_commission_brackets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rozetka_commission_brackets ENABLE ROW LEVEL SECURITY;

--
-- Name: rozetka_commission_refs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rozetka_commission_refs ENABLE ROW LEVEL SECURITY;

--
-- Name: rozetka_moderation_state; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rozetka_moderation_state ENABLE ROW LEVEL SECURITY;

--
-- Name: sales_channels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sales_channels ENABLE ROW LEVEL SECURITY;

--
-- Name: search_demand; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.search_demand ENABLE ROW LEVEL SECURITY;

--
-- Name: search_queries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.search_queries ENABLE ROW LEVEL SECURITY;

--
-- Name: seo_actions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.seo_actions ENABLE ROW LEVEL SECURITY;

--
-- Name: showcase_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.showcase_items ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_balance; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_balance ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_batches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_batches ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_movements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: stock_reservations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stock_reservations ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_brand_discounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supplier_brand_discounts ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_contracts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supplier_contracts ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_payment_allocations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supplier_payment_allocations ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_product_overrides; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supplier_product_overrides ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_promotions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supplier_promotions ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_sku_map; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supplier_sku_map ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_stock; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supplier_stock ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_sync_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supplier_sync_log ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_unmapped_skus; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supplier_unmapped_skus ENABLE ROW LEVEL SECURITY;

--
-- Name: suppliers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

--
-- Name: sync_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;

--
-- Name: uom; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.uom ENABLE ROW LEVEL SECURITY;

--
-- Name: uom_conversions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.uom_conversions ENABLE ROW LEVEL SECURITY;

--
-- Name: warehouses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

--
-- Name: webhook_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

--
-- Name: wishlists; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;

--
-- Name: wishlists wishlists_owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wishlists_owner_all ON public.wishlists USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- PostgreSQL database dump complete
--

\unrestrict afmcTj9FYPI97jedOBuInz5RDrnzifZ2RdthtIdxMGijyen3Xsjg2OzffqmKqkw

