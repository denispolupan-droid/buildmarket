-- 137: закрити службові ціни й дебіторку від anon/authenticated.
--
-- Аудит 31.10.2026 підтвердив на проді: анонімним (publishable) ключем читались
-- product_stock.price_cost / price_drop / price_wholesale / supplier_sku,
-- products.supplier_sku / min_price / purchase_ratio / *_markup_pct, а також
-- views ar_aging / ar_balances (дебіторка з іменами клієнтів). Політики
-- `USING (true)` на products/product_stock лишаються — вітрина читає їх
-- напряму з браузера (обране гостя), але привілеї звужено до колонок.
--
-- Серверний код ходить із service_role і цієї міграції не помічає.
-- Клієнтський код, який робив select('*') на products/product_stock
-- (обране гостя, пошук товару в модалках обліку), переведено на явні колонки
-- / адмін-роут у тому ж коміті.

-- ── 1. product_stock: БІЛИЙ список колонок ──────────────────────────────────
-- Той самий перелік, що й publicStock() у lib/public-product.ts.
revoke all on table public.product_stock from anon, authenticated;
grant select (id, sku, price_old, stock_qty, stock_status, updated_at,
              price_retail, price_retail_old, price_promo, price_locked)
  on public.product_stock to anon, authenticated;
-- price_unit (оптова) — лише залогіненим: кабінет опту й модалки адмінки
-- читають її з браузера; гостю вона не потрібна.
grant select (price_unit) on public.product_stock to authenticated;

-- ── 2. products: ЧОРНИЙ список колонок ──────────────────────────────────────
-- У products ~50 колонок і майже всі потрібні вітрині; список прихованих —
-- INTERNAL_PRODUCT_KEYS з lib/public-product.ts + epicentr_markup_pct.
-- Перелік видимих будується з information_schema, щоб не розійтись із
-- фактичним набором колонок на prod/test.
revoke all on table public.products from anon, authenticated;
do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'products'
    and column_name not in (
      'supplier_sku', 'min_price', 'purchase_ratio', 'sale_ratio',
      'purchase_uom', 'purchase_uom_factor',
      'prom_markup_pct', 'rozetka_markup_pct', 'epicentr_markup_pct'
    );
  execute format('grant select (%s) on public.products to anon, authenticated', cols);
end $$;

-- ── 3. Views: лише для service_role ──────────────────────────────────────────
-- ar_aging / ar_balances були пересоздані міграціями 110/112 без
-- security_invoker — тобто виконувались з правами власника й обходили RLS.
alter view public.ar_aging    set (security_invoker = on);
alter view public.ar_balances set (security_invoker = on);
revoke all on
  public.ar_aging, public.ar_balances, public.ar_transactions,
  public.open_purchase_orders, public.partner_balance_reconciliation,
  public.procurement_summary, public.product_seo_state, public.admin_products_list
from anon, authenticated;

-- ── 4. orders: INSERT лише сервером ─────────────────────────────────────────
-- Чекаут (/api/orders) створює замовлення через service_role з перерахунком
-- цін; політики INSERT для anon/authenticated дозволяли вставляти замовлення
-- напряму через PostgREST в обхід цін, rate-limit і сповіщень.
drop policy if exists "Allow guest order inserts" on public.orders;
drop policy if exists "Users can insert own orders" on public.orders;
revoke all on table public.orders from anon;
revoke insert, delete, truncate, references, trigger on table public.orders from authenticated;
-- SELECT/UPDATE для authenticated лишаються: «Users can view own orders»
-- (кабінет читає свої замовлення з браузера) і «Admins can update orders».
