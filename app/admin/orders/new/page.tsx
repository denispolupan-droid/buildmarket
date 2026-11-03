import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import NewOrderClient from './NewOrderClient';
import { requireStaffPage } from '../../../../lib/auth-guard';

export default async function NewOrderPage() {
  await requireStaffPage('admin', 'manager');
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

  return <NewOrderClient />;
}
