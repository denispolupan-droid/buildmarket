import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../lib/supabase-server';
import PricingModelClient from './PricingModelClient';
import { requireStaffPage } from '../../../lib/auth-guard';

export const dynamic = 'force-dynamic';

export default async function PricingModelPage() {
  await requireStaffPage('admin');
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');
  return <PricingModelClient />;
}
