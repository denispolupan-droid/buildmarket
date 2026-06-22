import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
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
      bankRecipient={process.env.BANK_RECIPIENT ?? 'ФОП Buildmarket'}
      bankIban={process.env.BANK_IBAN ?? 'UA00 0000 0000 0000 0000 0000 000'}
      bankName={process.env.BANK_NAME ?? 'АТ «ПриватБанк»'}
      bankEdrpou={process.env.BANK_EDRPOU ?? '00000000'}
      bankAddress={process.env.BANK_ADDRESS ?? ''}
      signatoryName={process.env.SIGNATORY_NAME ?? ''}
    />
  );
}
