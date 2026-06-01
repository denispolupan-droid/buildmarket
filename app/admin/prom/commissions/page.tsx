import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import PromCommissionsClient from './PromCommissionsClient';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const metadata = { title: 'Комісії Prom.ua — Адмін' };

export default async function PromCommissionsPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') redirect('/');

  const [{ data: categories }, { data: planRow }] = await Promise.all([
    db.from('categories')
      .select('slug, name, parent_slug, prom_commission_pct, prom_commission_pct_econom')
      .order('parent_slug', { nullsFirst: true })
      .order('name'),
    db.from('app_settings').select('value').eq('key', 'prom_plan').maybeSingle(),
  ]);

  const plan = (planRow?.value ?? 'single') as 'single' | 'econom';

  return <PromCommissionsClient categories={categories ?? []} plan={plan} />;
}
