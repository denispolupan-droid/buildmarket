import { createClient } from '@supabase/supabase-js';
import EnrichClient from './EnrichClient';
import { requireStaffPage } from '../../../../lib/auth-guard';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const dynamic = 'force-dynamic';

export default async function EnrichPage() {
  // Гейт сторінки: layout пускає admin|manager, а дані тут — лише для admin (аудит 31.10.2026)
  await requireStaffPage('admin');
  const { count: totalMissing } = await db
    .from('products')
    .select('*', { count: 'exact', head: true })
    .or('description_full.is.null,description_full.eq.')
    .eq('is_active', true);

  const { data: rawCats } = await db
    .from('products')
    .select('category_slug')
    .or('description_full.is.null,description_full.eq.')
    .eq('is_active', true);

  const catCounts: Record<string, number> = {};
  for (const row of (rawCats ?? [])) {
    const slug = row.category_slug ?? '';
    if (slug) catCounts[slug] = (catCounts[slug] ?? 0) + 1;
  }

  const categories = Object.entries(catCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([slug, cnt]) => ({ slug, cnt }));

  return (
    <EnrichClient
      totalMissing={totalMissing ?? 0}
      categories={categories}
    />
  );
}
