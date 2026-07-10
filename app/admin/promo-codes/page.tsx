import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../lib/supabase-server';
import { redirect } from 'next/navigation';
import PromoCodesClient from './PromoCodesClient';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export default async function PromoCodesPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') redirect('/admin');

  const { data: codes } = await db
    .from('promo_codes')
    .select('*')
    .order('created_at', { ascending: false });

  return <PromoCodesClient initial={codes ?? []} />;
}
