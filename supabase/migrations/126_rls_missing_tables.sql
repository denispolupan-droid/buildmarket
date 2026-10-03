-- 126: RLS на таблицях, які лишилися без нього.
--
-- Аудит 03.10.2026: п'ять таблиць створені без ENABLE ROW LEVEL SECURITY, а
-- стандартні гранти Supabase дають anon/authenticated SELECT/INSERT. Публічним
-- anon-ключем (він у бандлі сайту) через PostgREST читалися: novapay_txns
-- (виписка NovaPay, 131 рядок), supplier_payment_allocations (520),
-- customer_notifications (524, телефони покупців), pricing_rules, seo_actions.
--
-- Усі звернення до цих таблиць у коді йдуть із сервера через service role
-- (перевірено: жодного браузерного клієнта), тож політик не потрібно:
-- RLS увімкнений без політик = заборона для anon/authenticated, service role
-- RLS обходить. Той самий підхід, що й у 030/043/052/087.

ALTER TABLE public.novapay_txns                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_notifications       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_rules                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_actions                  ENABLE ROW LEVEL SECURITY;
