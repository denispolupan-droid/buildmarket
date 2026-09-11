import { requireStaffPage } from '../../../lib/auth-guard';
import { createServiceClient } from '../../../lib/supabase';
import { EPICENTR_TOKEN_KEY } from '../../../lib/epicentr-api';
import { EPICENTR_COMMISSION_FALLBACK_KEY, EPICENTR_COMMISSION_DEFAULT_PCT } from '../../../lib/epicentr-commission';
import EpicentrDashboardClient from './EpicentrDashboardClient';

export const metadata = { title: 'Епіцентр — Адмін' };

export default async function EpicentrPage() {
  await requireStaffPage('admin');
  const db = createServiceClient();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://fixline.com.ua';
  const feedKey = process.env.FEED_SECRET_KEY ?? '';

  const [{ count: totalOrders }, { count: totalProducts }, { count: enabledProducts }, { data: catStats }, { data: tokenSetting }, { data: fbSetting }] = await Promise.all([
    db.from('orders').select('*', { count: 'exact', head: true }).eq('channel_code', 'epicentr'),
    db.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true),
    db.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true).eq('on_epicentr', true),
    db.from('categories').select('epicentr_commission_pct, epicentr_category_code').limit(2000),
    db.from('app_settings').select('value').eq('key', EPICENTR_TOKEN_KEY).maybeSingle(),
    db.from('app_settings').select('value').eq('key', EPICENTR_COMMISSION_FALLBACK_KEY).maybeSingle(),
  ]);

  const rawToken = tokenSetting?.value || process.env.EPICENTR_API_TOKEN || '';
  const fallbackPct = Number.parseFloat(fbSetting?.value ?? '') || EPICENTR_COMMISSION_DEFAULT_PCT;

  return (
    <EpicentrDashboardClient
      hasToken={!!rawToken}
      maskedToken={rawToken ? `••••••••${rawToken.slice(-4)}` : null}
      feedUrl={`${siteUrl}/api/epicentr/feed?key=${feedKey}`}
      totalOrders={totalOrders ?? 0}
      totalProducts={totalProducts ?? 0}
      enabledProducts={enabledProducts ?? 0}
      catsWithCommission={(catStats ?? []).filter(c => c.epicentr_commission_pct != null).length}
      catsWithCode={(catStats ?? []).filter(c => !!c.epicentr_category_code).length}
      totalCats={(catStats ?? []).length}
      fallbackPct={fallbackPct}
    />
  );
}
