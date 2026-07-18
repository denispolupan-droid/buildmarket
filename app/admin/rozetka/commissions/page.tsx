import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import RozetkaCommissionsClient from './RozetkaCommissionsClient';

export const metadata = { title: 'Комісії Rozetka — Адмін' };

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function RozetkaCommissionsPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

  const { data: categories } = await db
    .from('categories')
    .select('slug, name, parent_slug, rozetka_category_id, rozetka_category_name, rozetka_commission_pct, rozetka_markup_pct, rozetka_commission_rz_id, rozetka_commission_label')
    .order('parent_slug', { nullsFirst: true })
    .order('name');

  return <RozetkaCommissionsClient categories={categories ?? []} />;
}
