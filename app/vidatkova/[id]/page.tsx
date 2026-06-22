import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
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

  let order: {
    company: string | null;
    contact: string;
    phone: string;
    email: string;
    order_number: number;
  } | null = null;

  if (doc.order_id) {
    const { data: o } = await db
      .from('orders')
      .select('company, contact, phone, email, order_number')
      .eq('id', doc.order_id)
      .single();
    order = o;
  }

  const printLines = (lines ?? []).map((l: { sku: string; qty: number; price: number }) => ({
    sku: l.sku,
    name: nameMap.get(l.sku) || l.sku,
    qty: Number(l.qty),
    price: Number(l.price ?? 0),
  }));

  const total = printLines.reduce((s, l) => s + l.qty * l.price, 0);
  const buyerName = order ? (order.company || order.contact) : (doc.counterparty ?? '—');

  return (
    <VidatkovaNakladna
      docId={id}
      docNumber={doc.doc_number}
      docDate={doc.doc_date}
      lines={printLines}
      total={total}
      sellerName={process.env.BANK_RECIPIENT ?? 'ФОП Buildmarket'}
      sellerEdrpou={process.env.BANK_EDRPOU ?? ''}
      sellerAddress={process.env.BANK_ADDRESS ?? ''}
      sellerBank={process.env.BANK_NAME ?? ''}
      sellerIban={process.env.BANK_IBAN ?? ''}
      buyerName={buyerName}
      buyerPhone={order?.phone ?? null}
      orderNumber={order?.order_number ?? null}
      signatoryName={process.env.SIGNATORY_NAME ?? ''}
      defaultEmail={order?.email ?? null}
    />
  );
}
