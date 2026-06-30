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

  const siteUrl   = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://fixline.com.ua';
  const hasApiKey = !!process.env.ROZETKA_API_KEY;

  const [
    { count: totalProducts },
    { count: enabledProducts },
    { data: catStats },
  ] = await Promise.all([
    db.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true),
    db.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true).eq('on_rozetka', true),
    db.from('categories').select('rozetka_category_id, rozetka_commission_pct'),
  ]);

  const catsWithId         = (catStats ?? []).filter(c => c.rozetka_category_id).length;
  const catsWithCommission = (catStats ?? []).filter(c => c.rozetka_commission_pct != null).length;

  return (
    <RozetkaClient
      feedUrl={`${siteUrl}/api/rozetka/feed`}
      hasApiKey={hasApiKey}
      totalProducts={totalProducts ?? 0}
      enabledProducts={enabledProducts ?? 0}
      catsWithId={catsWithId}
      catsWithCommission={catsWithCommission}
      totalCats={(catStats ?? []).length}
    />
  );
}
