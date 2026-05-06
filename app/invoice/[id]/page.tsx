import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import InvoicePrint from './InvoicePrint';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: order } = await serviceClient
    .from('orders')
    .select('*')
    .eq('id', id)
    .single();

  if (!order) redirect('/');

  // UUID is unguessable — anyone with the link can view the invoice
  return <InvoicePrint order={order} />;
}
