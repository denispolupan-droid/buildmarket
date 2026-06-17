import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../../lib/supabase';
import { recordDropshipSale } from '../../../../../../lib/accounting/dropship';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const db = createServiceClient();

  const { data: order, error } = await db
    .from('orders')
    .select('id, order_number, status, items, channel_code, customer_id')
    .eq('id', id)
    .single();

  if (error || !order) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!['confirmed', 'picking', 'awaiting_stock'].includes(order.status)) {
    return NextResponse.json(
      { error: `Неможливо відвантажити із статусу "${order.status}"` },
      { status: 409 },
    );
  }

  // Idempotency: if sale doc already exists, just update status
  const { data: existingSale } = await db
    .from('acc_documents')
    .select('id, doc_number')
    .eq('order_id', id)
    .eq('doc_type', 'sale')
    .neq('status', 'cancelled')
    .maybeSingle();

  if (existingSale) {
    await db.from('orders').update({
      status: 'shipped',
      shipped_at: new Date().toISOString(),
    }).eq('id', id);
    return NextResponse.json({
      ok: true,
      sale_doc_id: existingSale.id,
      sale_doc_number: existingSale.doc_number,
      status: 'shipped',
    });
  }

  const saleDocId = await recordDropshipSale({
    order_id:     order.id,
    order_number: order.order_number,
    order_items:  order.items as { sku: string; qty: number; price: number; name: string; brand: string }[],
    channel_code: order.channel_code ?? 'website',
    confirmed_by: user.email ?? 'admin',
    customer_id:  order.customer_id ?? undefined,
    business_date: new Date().toISOString().split('T')[0],
  });

  await db.from('orders').update({
    status: 'shipped',
    shipped_at: new Date().toISOString(),
  }).eq('id', id);

  const { data: saleDoc } = await db
    .from('acc_documents')
    .select('doc_number')
    .eq('id', saleDocId)
    .single();

  return NextResponse.json({
    ok: true,
    sale_doc_id: saleDocId,
    sale_doc_number: saleDoc?.doc_number ?? null,
    status: 'shipped',
  });
}
