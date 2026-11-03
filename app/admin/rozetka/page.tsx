import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../lib/supabase-server';
import RozetkaClient from './RozetkaClient';
import SellerRatingCard from './SellerRatingCard';
import { getRozetkaSellerRating, type RozetkaSellerRating } from '../../../lib/rozetka-api';
import { createServiceClient } from '../../../lib/supabase-service';
import { readSetting } from '../../../lib/secrets';

export const metadata = { title: 'Rozetka — Адмін' };

const db = createServiceClient();

export default async function RozetkaPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

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
    readSetting(db, 'rozetka_api_token').then(value => ({ data: { value } })),
    db.from('app_settings').select('value').eq('key', 'rozetka_login').maybeSingle(),
  ]);

  const rawToken   = tokenRow?.value || process.env.ROZETKA_API_KEY || '';
  const hasApiKey  = !!rawToken;
  const maskedToken = rawToken ? `••••••••${rawToken.slice(-4)}` : null;

  const credentialsLogin = (loginRow?.value as string | undefined) ?? null;
  const hasCredentials   = !!credentialsLogin;

  const catsWithId         = (catStats ?? []).filter(c => c.rozetka_category_id).length;
  const catsWithCommission = (catStats ?? []).filter(c => c.rozetka_commission_pct != null).length;

  // Рейтинг продавця з кабінету — не валимо сторінку, якщо API недоступний
  let sellerRating: RozetkaSellerRating | null = null;
  try {
    sellerRating = await getRozetkaSellerRating();
  } catch { /* без токена/при збої просто не показуємо плашку */ }

  return (
    <>
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
    <SellerRatingCard rating={sellerRating} />
    </>
  );
}
