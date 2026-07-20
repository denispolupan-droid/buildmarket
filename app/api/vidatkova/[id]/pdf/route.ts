import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildVidatkovaPdf } from '../../../../../lib/vidatkova-pdf';
import { SELLER } from '../../../../../lib/company';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Публічне завантаження PDF видаткової накладної. Доступ за unguessable UUID —
// та сама модель, що й сторінка /vidatkova/[id], яку клієнт відкриває за
// посиланням; нових даних понад те, що вже на сторінці, роут не розкриває.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // ?inline=1 → show in the browser's PDF viewer (used by the "Друк" button to
  // print the exact same portrait A4 file); default = download (attachment).
  const inline = req.nextUrl.searchParams.get('inline') === '1';

  const [{ data: doc }, { data: lines }] = await Promise.all([
    db.from('acc_documents').select('*').eq('id', id).single(),
    db.from('acc_document_lines').select('*').eq('document_id', id).order('sort_order'),
  ]);
  if (!doc || doc.doc_type !== 'sale') return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const skus = (lines ?? []).map((l: { sku: string }) => l.sku).filter(Boolean);
  const { data: products } = skus.length
    ? await db.from('products').select('sku, name, brand').in('sku', skus)
    : { data: [] };
  const nameMap = new Map((products ?? []).map(p => [p.sku, `${p.brand} ${p.name}`.trim()]));

  let order: { company: string | null; contact: string; phone: string; order_number: number } | null = null;
  if (doc.order_id) {
    const { data: o } = await db
      .from('orders')
      .select('company, contact, phone, order_number')
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

  const pdf = await buildVidatkovaPdf({
    docNumber:    doc.doc_number,
    docDate:      doc.doc_date,
    lines:        printLines,
    total,
    sellerName:   SELLER.name,
    sellerEdrpou: SELLER.edrpou,
    sellerAddress: SELLER.address,
    sellerBank:   SELLER.bank,
    sellerIban:   SELLER.iban,
    buyerName,
    buyerPhone:   order?.phone ?? null,
    orderNumber:  order?.order_number ?? null,
    signatoryName: SELLER.signatory,
  });

  const asciiName = `FIXLINE_vidatkova_${String(doc.doc_number).replace(/[^\x20-\x7E]/g, '')}.pdf`;
  const utf8Name  = encodeURIComponent(`Видаткова_${doc.doc_number}.pdf`);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`,
      'Cache-Control': 'private, no-store',
    },
  });
}
