-- Чотири таблиці, створені на prod сирим SQL в обхід міграцій (виявлено 2026-07-29,
-- коли CI-білд упав на тестовій БД без них). DDL знято з живого prod (pg_catalog).
-- На prod і test вже існують — файл фіксує схему в репо, IF NOT EXISTS робить його
-- ідемпотентним. RLS без політик: таблиці читаються лише service-role (див. 043).

-- Прочитані листи поштової скриньки (розділ «Пошта» в адмінці)
CREATE TABLE IF NOT EXISTS public.mail_read_messages (
  message_id text PRIMARY KEY,
  read_at timestamptz DEFAULT now()
);
ALTER TABLE public.mail_read_messages ENABLE ROW LEVEL SECURITY;

-- Моніторинг ринкових цін по SKU (порівняння з Rozetka/Prom)
CREATE TABLE IF NOT EXISTS public.market_price_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE REFERENCES public.products(sku),
  product_name text NOT NULL,
  our_price numeric,
  rozetka_min numeric,
  prom_min numeric,
  market_min numeric,
  market_avg numeric,
  match_count integer DEFAULT 0,
  delta_pct numeric,
  status text DEFAULT 'not_checked',
  results jsonb DEFAULT '[]'::jsonb,
  checked_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS market_price_checks_status_idx ON public.market_price_checks (status);
CREATE INDEX IF NOT EXISTS market_price_checks_delta_idx ON public.market_price_checks (delta_pct DESC NULLS LAST);
ALTER TABLE public.market_price_checks ENABLE ROW LEVEL SECURITY;

-- Довідники Rozetka: дерево категорій кабінету і ставки комісій по rz_id
CREATE TABLE IF NOT EXISTS public.rozetka_category_tree (
  rz_id text PRIMARY KEY,
  name text NOT NULL,
  commission_rz_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.rozetka_category_tree ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.rozetka_commission_refs (
  rz_id text PRIMARY KEY,
  name text NOT NULL,
  commission_pct numeric(5,2),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.rozetka_commission_refs ENABLE ROW LEVEL SECURITY;
