import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import InvoicePrint from './InvoicePrint';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/invoice/${id}`);

  const { data: order } = await serviceClient
    .from('orders')
    .select('*')
    .eq('id', id)
    .single();

  if (!order || (order.user_id !== user.id && user.user_metadata?.role !== 'admin')) {
    redirect('/account');
  }

  return <InvoicePrint order={order} />;
}
