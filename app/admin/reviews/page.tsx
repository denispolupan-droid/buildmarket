import { createClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../lib/supabase-server';
import ReviewsModerationClient from './ReviewsModerationClient';

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function AdminReviewsPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') redirect('/');

  const { data: reviews } = await service
    .from('product_reviews')
    .select('id, product_sku, author_name, rating, review_text, is_approved, created_at')
    .order('created_at', { ascending: false });

  return <ReviewsModerationClient reviews={reviews ?? []} />;
}
