-- Синхронізація ТЕСТОВОЇ бази з продом, 15.10.2026. Застосовано лише на test.
--
-- Знайдено e2e адмінки (tests/e2e/admin): /admin на тесті падав із
-- «column orders.carrier_accepted_at does not exist». Порівняння
-- information_schema.columns обох баз: у тесті бракувало 14 колонок і таблиці
-- prom_commissions_ref — усе це додавалось на прод сирим SQL повз міграції
-- (див. аудит 03.10.2026). Визначення взяті зі знімка baseline-2026-10-03.sql.
-- Це не міграція (на проді вже є), тому лежить тут, а не в migrations/.

ALTER TABLE public.chat_sessions ADD COLUMN IF NOT EXISTS ai_enabled boolean NOT NULL DEFAULT true;

CREATE SEQUENCE IF NOT EXISTS public.customers_customer_number_seq;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS customer_number integer NOT NULL DEFAULT nextval('public.customers_customer_number_seq'::regclass);
ALTER SEQUENCE public.customers_customer_number_seq OWNED BY public.customers.customer_number;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS prom_order_id bigint;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS rozetka_order_id bigint;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS promo_code text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS promo_discount numeric;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS carrier_accepted_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS orders_prom_order_id_idx ON public.orders (prom_order_id) WHERE prom_order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS orders_rozetka_order_id_key ON public.orders (rozetka_order_id) WHERE rozetka_order_id IS NOT NULL;

ALTER TABLE public.supplier_brand_discounts ADD COLUMN IF NOT EXISTS keep_price boolean DEFAULT false;

ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS bank_iban text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS bank_name text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS bank_swift text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS legal_name text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS edrpou text;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS payment_days integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.prom_commissions_ref (
    prom_category_id bigint NOT NULL PRIMARY KEY,
    name text NOT NULL,
    path text,
    commission_single numeric(6,3),
    commission_ecom numeric(6,3),
    commission_more numeric(6,3),
    commission_turbo numeric(6,3)
);
ALTER TABLE public.prom_commissions_ref ENABLE ROW LEVEL SECURITY;

-- 17.10: колонка suppliers.sheet_name була лише в тесті (у проді й коді її немає) — прибрано.
ALTER TABLE public.suppliers DROP COLUMN IF EXISTS sheet_name;
