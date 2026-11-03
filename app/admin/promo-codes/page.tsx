import { createSupabaseServer } from '../../../lib/supabase-server';
import { redirect } from 'next/navigation';
import PromoCodesClient from './PromoCodesClient';
import { createServiceClient } from '../../../lib/supabase-service';
import type { ComponentProps } from 'react';
import { requireStaffPage } from '../../../lib/auth-guard';

const db = createServiceClient();

export default async function PromoCodesPage() {
  await requireStaffPage('admin');
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/admin');

  const { data: codes } = await db
    .from('promo_codes')
    .select('*')
    .order('created_at', { ascending: false });

  return <PromoCodesClient initial={(codes ?? []) as ComponentProps<typeof PromoCodesClient>['initial']} />;
}
