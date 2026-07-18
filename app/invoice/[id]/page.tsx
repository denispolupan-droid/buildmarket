import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { SELLER } from '../../../lib/company';
import InvoicePrint from './InvoicePrint';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

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
  return (
    <InvoicePrint
      order={order}
      bankRecipient={SELLER.name}
      bankIban={SELLER.iban}
      bankName={SELLER.bank}
      bankEdrpou={SELLER.edrpou}
      bankAddress={SELLER.address}
      signatoryName={SELLER.signatory}
    />
  );
}
