import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { SELLER } from '../../../lib/company';
import { loadInvoiceView } from '../../../lib/invoice-buyer';
import { createSupabaseServer } from '../../../lib/supabase-server';
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

  const { buyer, showDelivery, showTerms } = await loadInvoiceView(serviceClient, order);

  // Сторінка публічна (UUID = секрет у посиланні), але робочі кнопки
  // (Email/Excel/месенджери/друк) бачить лише персонал — клієнту лишаємо PDF.
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const isStaff = ['admin', 'manager'].includes(user?.app_metadata?.role ?? '');

  // UUID is unguessable — anyone with the link can view the invoice
  return (
    <InvoicePrint
      isStaff={isStaff}
      order={order}
      buyer={buyer}
      showDelivery={showDelivery}
      showTerms={showTerms}
      bankRecipient={SELLER.name}
      bankIban={SELLER.iban}
      bankName={SELLER.bank}
      bankEdrpou={SELLER.edrpou}
      bankAddress={SELLER.address}
      signatoryName={SELLER.signatory}
    />
  );
}
