-- 124. Конвеєр наявності: фіксація в міграції + запобіжник від записів-пустушок
--
-- ЧОМУ ЦЯ МІГРАЦІЯ ІСНУЄ
-- Чотири функції та тригер, якими керується наявність товару на сайті, жили
-- ТІЛЬКИ в базі — у supabase/migrations/ їх не було взагалі. Через це, читаючи
-- репозиторій, неможливо було побачити, що запис у supplier_stock тригером
-- переписує ще й product_stock. Саме тому в lib/supplier-sync.ts чотири місяці
-- жив прямий запис у product_stock, який тригер потім перезаписує (див. нижче).
-- Тіла функцій нижче ПЕРЕНЕСЕНІ З ПРОДА як є — крім однієї правки, описаної далі.
--
-- ЩО ЗМІНЕНО ПО СУТІ (єдина зміна)
-- sync_product_stock_from_suppliers раніше робила UPDATE product_stock БЕЗУМОВНО,
-- навіть коли всі значення вже такі самі. Тригер на supplier_stock викликає її на
-- КОЖЕН рядок кожного синку, тож на 800 SKU × 12 синків на добу виходило ~9,6 тис.
-- перезаписів рядків щодня, з яких жоден нічого не міняв. Тепер UPDATE має умову
-- «хоч одна цільова колонка відрізняється». Поведінка не змінюється: ті самі
-- значення в тих самих випадках, просто без запису, коли писати нічого.
-- Побічний наслідок, бажаний: product_stock.updated_at тепер означає «коли дані
-- справді змінились», а не «коли востаннє пробіг синк».
--
-- ЩО СВІДОМО НЕ ЧІПАЛИ (відоме, задокументоване)
-- product_stock пишуть ДВОЄ: ця функція (обирає найкращого постачальника за
-- пріоритетом) і прямий upsert у lib/supplier-sync.ts (пише дані постачальника,
-- який синкається зараз). Набори колонок різні:
--   * функція  — stock_qty, stock_status, price_unit, price_cost;
--   * прямий   — ще й price_retail, price_retail_old, price_drop, price_old.
-- Тобто для SKU з ДВОМА постачальниками роздрібна ціна братиметься від того, хто
-- синкнувся останнім, повз пріоритет. Зараз таких SKU нуль, тож баг сплячий.
-- Полагодити його означає зберігати роздрібні ціни посупроводово в supplier_stock
-- (зміна схеми + переписування сходинки цін і промо в застосунку) — це окрема
-- робота з іншим рівнем ризику, і робити її треба ДО появи першого спільного
-- товару у двох прайсах, а не разом із цією міграцією.
--
-- supplier_stock навмисно пишеться на кожен рядок без умов: last_synced_at — це
-- пульс для mark_absent_supplier_stock, яка за ним вирішує, кого постачальник
-- більше не возить. Пропустиш запис — асортимент тихо стане out_of_stock.

-- ── Агрегація залишку по найкращому постачальнику ────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_product_stock_from_suppliers(p_sku text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

-- ── Тригер supplier_stock → product_stock (перенесено з прода без змін) ──────
CREATE OR REPLACE FUNCTION public.fn_supplier_stock_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM sync_product_stock_from_suppliers(NEW.sku);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_supplier_stock_to_product ON public.supplier_stock;
CREATE TRIGGER trg_supplier_stock_to_product
  AFTER INSERT OR UPDATE ON public.supplier_stock
  FOR EACH ROW EXECUTE FUNCTION fn_supplier_stock_changed();

-- ── Позначення відсутніх у прайсі (перенесено з прода без змін) ──────────────
CREATE OR REPLACE FUNCTION public.mark_absent_supplier_stock(
  p_supplier_id integer,
  p_sync_started timestamp with time zone,
  p_rows_in_file integer,
  p_prev_rows integer DEFAULT NULL::integer
)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

-- ── Зняття in_stock із сиріт (перенесено з прода без змін) ───────────────────
CREATE OR REPLACE FUNCTION public.reconcile_orphan_stock()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
