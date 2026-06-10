import { createClient } from '@supabase/supabase-js';
import RepricingLogClient from './RepricingLogClient';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function RepricingLogPage() {
  const { data: entries } = await db
    .from('price_change_log')
    .select('id, created_at, type, value, target, is_promo, comment, revert_at, reverted_at, count, snapshot')
    .order('created_at', { ascending: false })
    .limit(200);

  return <RepricingLogClient entries={entries ?? []} />;
}
