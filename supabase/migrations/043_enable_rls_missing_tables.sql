-- 9 tables had RLS disabled, fully exposed to the anon/publishable key (readable/writable by
-- anyone with that key, which is public in the browser bundle). 8 of them are touched only via
-- the service-role key in admin API routes/scripts, which bypasses RLS entirely — enabling RLS
-- with no policies locks out anon/authenticated with zero effect on the app. brand_logos is the
-- one exception: read by anonymous visitors (homepage/About brand carousel) via the anon client,
-- so it gets an explicit public SELECT policy instead of a blanket lock.

ALTER TABLE public.mail_oauth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mail_read_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_price_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rozetka_commission_refs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rozetka_category_tree ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prom_commissions_ref ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.brand_logos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brand_logos public read" ON public.brand_logos
  FOR SELECT
  TO anon, authenticated
  USING (true);
