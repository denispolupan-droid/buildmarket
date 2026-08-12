import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../lib/supabase-server';
import { SELLER } from '../../../lib/company';
import { resolveVidatkovaBuyer } from '../../../lib/vidatkova-buyer';
import VidatkovaNakladna from './VidatkovaNakladna';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function VidatkovaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Only staff get the send/print toolbar; clients (opening the shared link) get
  // a clean download-only view — same model as the invoice page.
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const isStaff = ['admin', 'manager'].includes(user?.app_metadata?.role ?? '');

  const [{ data: doc }, { data: lines }] = await Promise.all([
    db.from('acc_documents').select('*').eq('id', id).single(),
    db.from('acc_document_lines').select('*').eq('document_id', id).order('sort_order'),
  ]);

  if (!doc || doc.doc_type !== 'sale') notFound();

  const skus = (lines ?? []).map((l: { sku: string }) => l.sku).filter(Boolean);
  const { data: products } = skus.length
    ? await db.from('products').select('sku, name, brand').in('sku', skus)
    : { data: [] };
  const nameMap = new Map((products ?? []).map(p => [p.sku, `${p.brand} ${p.name}`.trim()]));

  // Реквізити покупця — з картки контрагента (юр. назва, ІПН/ЄДРПОУ, адреса),
  // з фолбеком на дані замовлення.
  const buyer = await resolveVidatkovaBuyer(db, doc);

  const printLines = (lines ?? []).map((l: { sku: string; qty: number; price: number }) => ({
    sku: l.sku,
    name: nameMap.get(l.sku) || l.sku,
    qty: Number(l.qty),
    price: Number(l.price ?? 0),
  }));

  const total = printLines.reduce((s, l) => s + l.qty * l.price, 0);

  return (
    <VidatkovaNakladna
      docId={id}
      docNumber={doc.doc_number}
      docDate={doc.doc_date}
      lines={printLines}
      total={total}
      sellerName={SELLER.name}
      sellerEdrpou={SELLER.edrpou}
      sellerAddress={SELLER.address}
      sellerCity={SELLER.city}
      sellerBank={SELLER.bank}
      sellerIban={SELLER.iban}
      buyerName={buyer.name}
      buyerPhone={buyer.phone}
      buyerEdrpou={buyer.edrpou}
      buyerAddress={buyer.address}
      orderNumber={buyer.orderNumber}
      signatoryName={SELLER.signatory}
      defaultEmail={buyer.email}
      isStaff={isStaff}
    />
  );
}
