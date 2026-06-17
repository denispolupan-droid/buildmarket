import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import VydatkovaPrint from './VydatkovaPrint';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function VydatkovaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: doc } = await db
    .from('acc_documents')
    .select('id, doc_number, doc_date, order_id, status')
    .eq('id', id)
    .eq('doc_type', 'sale')
    .single();

  if (!doc) notFound();

  const { data: lines } = await db
    .from('acc_document_lines')
    .select('sku, qty, price')
    .eq('document_id', id)
    .order('sort_order');

  const skus = (lines ?? []).map(l => l.sku);
  const { data: products } = skus.length
    ? await db.from('products').select('sku, name, brand').in('sku', skus)
    : { data: [] };
  const prodMap = new Map((products ?? []).map(p => [p.sku, p]));

  const { data: order } = doc.order_id
    ? await db.from('orders')
        .select('order_number, contact, company, phone, email, delivery_address, total_price')
        .eq('id', doc.order_id)
        .single()
    : { data: null };

  if (!order) notFound();

  const items = (lines ?? []).map(l => {
    const p = prodMap.get(l.sku);
    return {
      sku:   l.sku,
      name:  p?.name  ?? l.sku,
      brand: p?.brand ?? '',
      qty:   Number(l.qty),
      price: Number(l.price ?? 0),
    };
  });

  return (
    <VydatkovaPrint
      doc={{ doc_number: doc.doc_number, doc_date: doc.doc_date }}
      order={{
        order_number:     order.order_number,
        contact:          order.contact,
        company:          order.company,
        phone:            order.phone,
        email:            order.email,
        delivery_address: order.delivery_address,
        items,
        total_price:      Number(order.total_price),
      }}
      sellerName={process.env.BANK_RECIPIENT ?? 'ФОП'}
      sellerEdrpou={process.env.BANK_EDRPOU ?? ''}
      sellerAddress={process.env.COMPANY_ADDRESS}
      sellerPhone={process.env.COMPANY_PHONE}
    />
  );
}
