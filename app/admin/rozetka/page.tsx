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
  const hasApiKey = !!process.env.ROZETKA_API_KEY;

  const [{ data: categories }, { count: totalProducts }, { count: productsWithPrice }] = await Promise.all([
    db.from('categories').select('id, slug, name, parent_slug, rozetka_category_id').order('sort_order'),
    db.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true),
    db.from('product_stock').select('*', { count: 'exact', head: true }).gt('price_retail', 0),
  ]);

  return (
    <RozetkaClient
      feedUrl={`${siteUrl}/api/rozetka/feed`}
      hasApiKey={hasApiKey}
      categories={categories ?? []}
      totalProducts={totalProducts ?? 0}
      productsWithPrice={productsWithPrice ?? 0}
    />
  );
}
