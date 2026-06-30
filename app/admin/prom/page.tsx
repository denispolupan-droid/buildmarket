import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import PromDashboardClient from './PromDashboardClient';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const metadata = { title: 'Prom.ua — Адмін' };

export default async function PromPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') redirect('/');

  const siteUrl  = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://fixline.com.ua';
  const feedKey  = process.env.FEED_SECRET_KEY ?? '';

  const [{ count: totalOrders }, { count: totalProducts }, { count: enabledProducts }, { data: catStats }, { data: tokenSetting }] = await Promise.all([
    db.from('orders').select('*', { count: 'exact', head: true }).eq('channel_code', 'prom'),
    db.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true),
    db.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true).eq('on_prom', true),
    db.from('categories').select('prom_commission_pct, prom_markup_pct'),
    db.from('app_settings').select('value').eq('key', 'prom_api_token').maybeSingle(),
  ]);

  const rawToken    = tokenSetting?.value || process.env.PROM_API_TOKEN || '';
  const hasToken    = !!rawToken;
  const maskedToken = rawToken ? `••••••••${rawToken.slice(-4)}` : null;

  const catsWithCommission = (catStats ?? []).filter(c => c.prom_commission_pct != null).length;
  const totalCats          = (catStats ?? []).length;

  return (
    <PromDashboardClient
      hasToken={hasToken}
      maskedToken={maskedToken}
      feedUrl={`${siteUrl}/api/prom-feed?key=${feedKey}`}
      totalOrders={totalOrders ?? 0}
      totalProducts={totalProducts ?? 0}
      enabledProducts={enabledProducts ?? 0}
      catsWithCommission={catsWithCommission}
      totalCats={totalCats}
    />
  );
}
