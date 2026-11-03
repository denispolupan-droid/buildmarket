-- 151: вирівнювання тестової бази з продом (schema-parity, перший розширений прогін 03.11.2026).
-- Джерело правди — прод: ці функції/тригер/індекси є в проді (частина без міграцій,
-- застосована руками раніше), у тесті їх не було або тіла відрізнялись (здебільшого
-- коментарями; суттєво: fn_guard_money_entries, fn_update_stock_reserved,
-- fn_queue_stock_sync, fn_generate_order_number — часовий пояс Києва).
-- Усе ідемпотентне: на проді нічого не змінює.

CREATE OR REPLACE FUNCTION public.apply_landed_costs(p_document_id uuid, p_method text)
 RETURNS numeric
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.charge_partner_balance(p_customer_id uuid, p_amount numeric, p_order_id uuid DEFAULT NULL::uuid, p_description text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.check_balance_integrity()
 RETURNS TABLE(customer_id uuid, stored_balance numeric, computed_balance numeric, drift numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    c.id                                              AS customer_id,
    c.balance                                         AS stored_balance,
    COALESCE(SUM(t.amount), 0)                        AS computed_balance,
    c.balance - COALESCE(SUM(t.amount), 0)            AS drift
  FROM customers c
  LEFT JOIN partner_balance_transactions t ON t.customer_id = c.id
  GROUP BY c.id, c.balance
  HAVING ABS(c.balance - COALESCE(SUM(t.amount), 0)) > 0.005;
$function$
;

CREATE OR REPLACE FUNCTION public.check_receipt_quantities(p_receipt_id uuid)
 RETURNS TABLE(sku text, ordered numeric, effective numeric, already_received numeric, this_receipt numeric, would_exceed boolean)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.fn_clear_price_lock_on_empty_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.fn_generate_order_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  $function$
;

CREATE OR REPLACE FUNCTION public.fn_guard_money_entries()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RAISE EXCEPTION 'money_entries є append-only. Використовуйте компенсуючий запис.';
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_queue_stock_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.fn_update_po_status_on_receipt()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.fn_update_stock_balance()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.fn_update_stock_reserved()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.increment_promo_used(p_code text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  UPDATE promo_codes SET uses_count = uses_count + 1 WHERE code = p_code;
$function$
;

CREATE OR REPLACE FUNCTION public.reserve_order_items(p_order_id uuid, p_warehouse_id integer, p_items jsonb, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.reserve_order_items(p_order_id uuid, p_warehouse_id integer, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.reset_accounting_test_data()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.search_prom_categories(q text DEFAULT ''::text, lim integer DEFAULT 20)
 RETURNS TABLE(prom_category_id bigint, name text, path text, commission_single numeric, commission_ecom numeric, commission_more numeric, commission_turbo numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.sync_customer_name_to_contracts()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

DROP TRIGGER IF EXISTS trg_po_status_on_receipt ON public.acc_documents;
CREATE TRIGGER trg_po_status_on_receipt AFTER UPDATE ON public.acc_documents FOR EACH ROW EXECUTE FUNCTION fn_update_po_status_on_receipt();

CREATE INDEX IF NOT EXISTS idx_doc_lines_po_line ON public.acc_document_lines USING btree (po_line_id) WHERE (po_line_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_docs_parent ON public.acc_documents USING btree (parent_doc_id) WHERE (parent_doc_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_docs_proc_status ON public.acc_documents USING btree (procurement_status) WHERE (procurement_status IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_expenses_source ON public.expenses USING btree (source, source_id) WHERE (source_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_expenses_type ON public.expenses USING btree (expense_type, business_date);
CREATE INDEX IF NOT EXISTS idx_lc_document ON public.landed_cost_lines USING btree (document_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_money_entries_sale_shipment ON public.money_entries USING btree (doc_id) WHERE ((doc_id IS NOT NULL) AND (account_type = 'customer'::text) AND (amount > (0)::numeric));
CREATE INDEX IF NOT EXISTS orders_channel_code_idx ON public.orders USING btree (channel_code) WHERE (channel_code IS NOT NULL);
CREATE INDEX IF NOT EXISTS product_reviews_is_approved_created_at_idx ON public.product_reviews USING btree (is_approved, created_at DESC);
CREATE INDEX IF NOT EXISTS product_reviews_product_sku_is_approved_idx ON public.product_reviews USING btree (product_sku, is_approved);
CREATE UNIQUE INDEX IF NOT EXISTS stock_notifications_sku_email_key ON public.stock_notifications USING btree (sku, email);
CREATE UNIQUE INDEX IF NOT EXISTS wishlists_user_id_product_sku_key ON public.wishlists USING btree (user_id, product_sku);
