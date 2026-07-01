import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import AttributesClient from './AttributesClient';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const metadata = { title: 'Атрибути Прома — Адмін' };

export default async function PromAttributesPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') redirect('/');

  const { data: rows } = await db
    .from('prom_attributes')
    .select('prom_category_id')
    .order('prom_category_id');

  const counts: Record<number, number> = {};
  for (const r of rows ?? []) {
    counts[r.prom_category_id] = (counts[r.prom_category_id] ?? 0) + 1;
  }
  const imported = Object.entries(counts).map(([id, count]) => ({
    prom_category_id: Number(id),
    attribute_count: count,
  }));

  return <AttributesClient imported={imported} />;
}
