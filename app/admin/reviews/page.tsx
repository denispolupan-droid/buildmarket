import { createClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../lib/supabase-server';
import ReviewsTabs from './ReviewsTabs';

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const metadata = { title: 'Відгуки | FIXLINE' };

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

  const { data: reviews } = await service
    .from('product_reviews')
    .select('id, product_sku, author_name, rating, review_text, is_approved, created_at')
    .order('created_at', { ascending: false })
    .limit(500);

  return <ReviewsTabs reviews={reviews ?? []} initialTab={tab === 'rozetka' ? 'rozetka' : 'site'} />;
}
