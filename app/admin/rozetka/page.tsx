import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import RozetkaClient from './RozetkaClient';

export const metadata = { title: 'Rozetka — Адмін' };

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function RozetkaPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') redirect('/');

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://fixline.com.ua';

  const [
    { count: totalProducts },
    { count: enabledProducts },
    { data: catStats },
    { data: tokenRow },
    { data: loginRow },
  ] = await Promise.all([
    db.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true),
    db.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true).eq('on_rozetka', true),
    db.from('categories').select('rozetka_category_id, rozetka_commission_pct'),
    db.from('app_settings').select('value').eq('key', 'rozetka_api_token').maybeSingle(),
    db.from('app_settings').select('value').eq('key', 'rozetka_login').maybeSingle(),
  ]);

  const rawToken   = tokenRow?.value || process.env.ROZETKA_API_KEY || '';
  const hasApiKey  = !!rawToken;
  const maskedToken = rawToken ? `••••••••${rawToken.slice(-4)}` : null;

  const credentialsLogin = (loginRow?.value as string | undefined) ?? null;
  const hasCredentials   = !!credentialsLogin;

  const catsWithId         = (catStats ?? []).filter(c => c.rozetka_category_id).length;
  const catsWithCommission = (catStats ?? []).filter(c => c.rozetka_commission_pct != null).length;

  return (
    <RozetkaClient
      feedUrl={`${siteUrl}/api/rozetka/feed`}
      hasApiKey={hasApiKey}
      maskedToken={maskedToken}
      hasCredentials={hasCredentials}
      credentialsLogin={credentialsLogin}
      totalProducts={totalProducts ?? 0}
      enabledProducts={enabledProducts ?? 0}
      catsWithId={catsWithId}
      catsWithCommission={catsWithCommission}
      totalCats={(catStats ?? []).length}
    />
  );
}
