import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import RozetkaAuditClient from './RozetkaAuditClient';

export const metadata = { title: 'Аудит назв Rozetka — Адмін' };

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function RozetkaAuditPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') redirect('/');

  const { data: products } = await db
    .from('products')
    .select('sku, name, rozetka_name, brand, category_slug, color, volume')
    .eq('is_active', true)
    .eq('on_rozetka', true)
    .order('category_slug')
    .order('name');

  const { data: categories } = await db
    .from('categories')
    .select('slug, name');

  return (
    <RozetkaAuditClient
      products={products ?? []}
      categories={categories ?? []}
    />
  );
}
