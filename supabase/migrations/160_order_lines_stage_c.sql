-- 160: order_lines, етап C (docs/ORDER-LINES-PLAN.md) — писарі йдуть через один
-- модуль (lib/orders/lines.ts), сума замовлення рахується базою з рядків.
--
--  1. BEFORE-тригер на orders: total_price = Σ round(qty×price, 2) по items,
--     якщо items — непорожній масив. Правило «сума лише з рядків» (I10) тепер
--     гарантує база, а не 14 писарів у коді. Порожній/відсутній items не чіпаємо
--     (фікстури, службові рядки).
--  2. order_set_lines(order_id, lines, patch): замінити позиції наявного замовлення
--     однією транзакцією — рядки в order_lines, items (jsonb) перебудовується з
--     рядків як кеш для старих читачів, total_price — тригером; patch — інші
--     колонки того самого запису (discount_pct, price_type …), як у
--     order_transition_outbox. Дзеркало items→lines при цьому вимкнене прапорцем
--     сесії (інакше воно перезаписало б щойно вставлені рядки тим самим).
--  3. Дзеркало items→lines (136) лишається для шляхів створення (insert з items)
--     і як страховка; I9 і далі звіряє обидві сторони.
--
-- Відкат: DROP TRIGGER trg_order_total_from_items; DROP FUNCTION fn_order_total_from_items,
-- order_set_lines; повернути fn_order_lines_mirror з 136. Код — git revert одного коміту.

-- ── 1. total_price = Σ рядків ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_order_total_from_items()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_total numeric;
BEGIN
  IF NEW.items IS NULL OR jsonb_typeof(NEW.items) <> 'array' OR jsonb_array_length(NEW.items) = 0 THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(SUM(round(COALESCE(NULLIF(e.i->>'qty', '')::numeric, 0) * COALESCE(NULLIF(e.i->>'price', '')::numeric, 0), 2)), 0)
    INTO v_total
  FROM jsonb_array_elements(NEW.items) AS e(i)
  WHERE jsonb_typeof(e.i) = 'object';
  NEW.total_price := v_total;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Криві числа в items — не привід валити запис замовлення; розходження
  -- впіймає I10, а сам рядок лишиться з тією сумою, яку дав код.
  RAISE WARNING 'order total from items failed for order % (#%): %', NEW.id, NEW.order_number, SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_order_total_from_items() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_order_total_from_items ON public.orders;
CREATE TRIGGER trg_order_total_from_items
  BEFORE INSERT OR UPDATE OF items ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.fn_order_total_from_items();

-- ── 2. Дзеркало з прапорцем сесії ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_order_lines_mirror()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  -- order_set_lines уже записав рядки й сам перебудував items з них
  IF current_setting('app.order_lines_source', true) = 'lines' THEN
    RETURN NEW;
  END IF;
  BEGIN
    PERFORM public.fn_order_lines_sync(NEW.id, NEW.items);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'order_lines mirror failed for order % (#%): %', NEW.id, NEW.order_number, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

-- ── 3. Заміна позицій наявного замовлення ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.order_set_lines(p_order_id uuid, p_lines jsonb, p_patch jsonb DEFAULT '{}'::jsonb)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_items  jsonb;
  v_total  numeric;
  v_cols   text;
  v_keys   int;
  v_known  int;
  v_rows   int;
  v_bad    text;
BEGIN
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'order_set_lines: потрібен непорожній масив позицій';
  END IF;
  -- Правила на значення: об'єкт, sku — рядок (порожній = вільна позиція), qty > 0, price ≥ 0
  SELECT string_agg(format('позиція %s: %s', e.n, CASE
           WHEN jsonb_typeof(e.i) <> 'object' THEN 'не обʼєкт'
           WHEN jsonb_typeof(e.i->'sku') NOT IN ('string') THEN 'sku не рядок'
           WHEN NOT (COALESCE(NULLIF(e.i->>'qty', ''), 'x') ~ '^-?[0-9]+(\.[0-9]+)?$') OR (e.i->>'qty')::numeric <= 0 THEN 'кількість має бути > 0'
           WHEN NOT (COALESCE(NULLIF(e.i->>'price', ''), 'x') ~ '^-?[0-9]+(\.[0-9]+)?$') OR (e.i->>'price')::numeric < 0 THEN 'некоректна ціна'
         END), '; ')
    INTO v_bad
  FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS e(i, n)
  WHERE jsonb_typeof(e.i) <> 'object'
     OR jsonb_typeof(e.i->'sku') NOT IN ('string')
     OR NOT (COALESCE(NULLIF(e.i->>'qty', ''), 'x') ~ '^-?[0-9]+(\.[0-9]+)?$') OR (e.i->>'qty')::numeric <= 0
     OR NOT (COALESCE(NULLIF(e.i->>'price', ''), 'x') ~ '^-?[0-9]+(\.[0-9]+)?$') OR (e.i->>'price')::numeric < 0;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'order_set_lines: %', v_bad;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM orders WHERE id = p_order_id) THEN
    RAISE EXCEPTION 'order_set_lines: замовлення % не знайдено', p_order_id;
  END IF;

  -- Рядки — у таблицю (той самий розбір, що в дзеркалі: product_id по sku, решта ключів у meta)
  PERFORM public.fn_order_lines_sync(p_order_id, p_lines);

  -- jsonb items — похідний від рядків (канонічна форма: числа числами, порядок sort_order)
  SELECT COALESCE(jsonb_agg(
           l.meta
           || jsonb_build_object('sku', l.sku, 'name', l.name, 'brand', l.brand, 'qty', l.qty, 'price', l.price,
                                 'is_promo', l.is_promo, 'is_bonus', l.is_bonus)
           || CASE WHEN l.price_base IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('price_base', l.price_base) END
           ORDER BY l.sort_order), '[]'::jsonb)
    INTO v_items
  FROM order_lines l WHERE l.order_id = p_order_id;

  -- Інші колонки того самого запису — лише відомі колонки orders
  IF p_patch IS NOT NULL AND p_patch <> '{}'::jsonb THEN
    SELECT count(*) INTO v_keys FROM jsonb_object_keys(p_patch);
    SELECT string_agg(format('%I', k), ', '), count(*) INTO v_cols, v_known
    FROM jsonb_object_keys(p_patch) k
    WHERE k NOT IN ('items', 'total_price')
      AND EXISTS (SELECT 1 FROM information_schema.columns c
                  WHERE c.table_schema = 'public' AND c.table_name = 'orders' AND c.column_name = k);
    IF v_known <> v_keys THEN
      RAISE EXCEPTION 'order_set_lines: patch містить невідому колонку orders або items/total_price';
    END IF;
  END IF;

  -- Дзеркало items→lines пропускаємо: рядки вже записані вище
  PERFORM set_config('app.order_lines_source', 'lines', true);
  IF v_cols IS NOT NULL THEN
    EXECUTE format(
      'UPDATE orders SET items = $1, (%s) = (SELECT %s FROM jsonb_populate_record(NULL::orders, $2)) WHERE id = $3',
      v_cols, v_cols
    ) USING v_items, p_patch, p_order_id;
  ELSE
    UPDATE orders SET items = v_items WHERE id = p_order_id;
  END IF;
  PERFORM set_config('app.order_lines_source', '', true);
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  SELECT total_price INTO v_total FROM orders WHERE id = p_order_id;
  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.order_set_lines(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.order_set_lines(uuid, jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION public.order_set_lines(uuid, jsonb, jsonb) IS
  'Етап C order_lines: замінити позиції замовлення (рядки + похідний items + total_price тригером) однією транзакцією; викликати лише з lib/orders/lines.ts.';

NOTIFY pgrst, 'reload schema';
