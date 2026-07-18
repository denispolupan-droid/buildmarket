import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { buildVidatkovaHtml } from '../../../../../../../lib/vidatkova-html';
import { buildVidatkovaPdf } from '../../../../../../../lib/vidatkova-pdf';
import { SELLER } from '../../../../../../../lib/company';

const resend = new Resend(process.env.RESEND_API_KEY);
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !['admin', 'manager'].includes(user.app_metadata?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json() as { email?: string };

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

  let order: { company: string | null; contact: string; phone: string; email: string; order_number: number } | null = null;
  if (doc.order_id) {
    const { data: o, error: oErr } = await db
      .from('orders')
      .select('company, contact, phone, email, order_number')
      .eq('id', doc.order_id)
      .single();
    if (!oErr) order = o;
  }

  const toEmail = body.email?.trim() || order?.email;
  if (!toEmail) return NextResponse.json({ error: 'Email не вказано' }, { status: 400 });

  const printLines = (lines ?? []).map((l: { sku: string; qty: number; price: number }) => ({
    sku: l.sku,
    name: nameMap.get(l.sku) || l.sku,
    qty: Number(l.qty),
    price: Number(l.price ?? 0),
  }));

  const total = printLines.reduce((s, l) => s + l.qty * l.price, 0);
  const buyerName = order ? (order.company || order.contact) : (doc.counterparty ?? '—');

  const buildParams = {
    docNumber: doc.doc_number,
    docDate: doc.doc_date,
    lines: printLines,
    total,
    sellerName:    SELLER.name,
    sellerEdrpou:  SELLER.edrpou,
    sellerAddress: SELLER.address,
    sellerBank:    SELLER.bank,
    sellerIban:    SELLER.iban,
    buyerName,
    buyerPhone:    order?.phone ?? null,
    orderNumber:   order?.order_number ?? null,
    signatoryName: SELLER.signatory,
    printUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/vidatkova/${id}`,
  };

  const [html, pdfBuffer] = await Promise.all([
    Promise.resolve(buildVidatkovaHtml(buildParams)),
    buildVidatkovaPdf(buildParams),
  ]);

  const date = new Date(doc.doc_date).toLocaleDateString('uk-UA', { day: '2-digit', month: 'long', year: 'numeric' });

  const { error: sendErr } = await resend.emails.send({
    from:    `${SELLER.name} <${process.env.RESEND_FROM_EMAIL ?? process.env.ADMIN_EMAIL ?? 'noreply@buildmarket.com.ua'}>`,
    to:      toEmail,
    subject: `Видаткова накладна ${doc.doc_number} від ${date}`,
    html,
    attachments: [{
      filename: `Видаткова_${doc.doc_number}.pdf`,
      content:  pdfBuffer,
    }],
  });

  if (sendErr) return NextResponse.json({ error: String(sendErr) }, { status: 500 });
  return NextResponse.json({ ok: true, to: toEmail });
}
