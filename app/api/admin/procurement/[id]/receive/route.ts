import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../../lib/supabase';
import { createDocument, confirmDocument } from '../../../../../../lib/accounting/documents';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await req.json() as {
    actualQties?:  Record<string, number>;
    actualPrices?: Record<string, number>;
    notes?:        string;
  };
  const db = createServiceClient();

  // Load PO with lines
  const { data: po } = await db
    .from('acc_documents')
    .select('*, lines:acc_document_lines(*)')
    .eq('id', id)
    .eq('doc_type', 'purchase_order')
    .eq('status', 'confirmed')
    .single();

  if (!po) return NextResponse.json({ error: 'PO не знайдено' }, { status: 404 });

  // Check no receipt yet (only receipt/stock_in, not adjustments!)
  const { count } = await db
    .from('acc_documents')
    .select('*', { count: 'exact', head: true })
    .eq('parent_doc_id', id)
    .eq('status', 'confirmed')
    .in('doc_type', ['receipt', 'stock_in']);

  if ((count ?? 0) > 0) return NextResponse.json({ error: 'Прихід вже існує для цього PO' }, { status: 409 });

  // Create receipt document
  const lines = (po.lines ?? []).map((l: { sku: string; qty: number; cost_price: number; supplier_id: number; warehouse_id: number }) => {
    const actualQty   = body.actualQties?.[l.sku];
    const actualPrice = body.actualPrices?.[l.sku];
    // Guard against NaN (empty input fields send NaN via parseFloat(''))
    const qty        = (actualQty  !== undefined && !isNaN(actualQty))  ? actualQty  : l.qty;
    const cost_price = (actualPrice !== undefined && !isNaN(actualPrice) && actualPrice > 0)
      ? actualPrice
      : (l.cost_price ?? 0);
    return {
    sku:              l.sku,
    qty,
    price:            0,
    cost_price,
    fulfillment_type: 'own' as const,
    warehouse_id:     l.warehouse_id ?? po.warehouse_id,
    supplier_id:      l.supplier_id ?? po.supplier_id,
    };
  });

  const receipt = await createDocument({
    doc_type:     'receipt',
    warehouse_id: po.warehouse_id,
    supplier_id:  po.supplier_id,
    order_id:     po.order_id,
    notes:        body.notes || `Прихід за ${po.doc_number}`,
    created_by:   user.email ?? 'admin',
    meta:         { parent_doc_id: id },
    lines,
  });

  // Set parent link
  await db.from('acc_documents').update({ parent_doc_id: id }).eq('id', receipt.id);

  // Confirm receipt → creates FIFO batches, updates stock_balance
  await confirmDocument(receipt.id, user.email ?? 'admin');

  // Update PO procurement_status: 'received' if all items fully received, else 'partially_received'
  const allReceived = (po.lines ?? []).every((l: { sku: string; qty: number }) => {
    const actualQty = body.actualQties?.[l.sku];
    const receivedQty = (actualQty !== undefined && !isNaN(actualQty)) ? actualQty : l.qty;
    return receivedQty >= l.qty;
  });
  await db.from('acc_documents')
    .update({ procurement_status: allReceived ? 'received' : 'partially_received' })
    .eq('id', id);

  // Record AP: ми винні постачальнику (debit stock_asset → credit supplier)
  if (po.total_cost && po.total_cost > 0 && po.supplier_id) {
    await db.rpc('record_money_txn', {
      p_debit_account:  'variance',   // буде stock_asset після повного впровадження
      p_credit_account: 'supplier',
      p_debit_party:    null,
      p_credit_party:   String(po.supplier_id),
      p_amount:         po.total_cost,
      p_business_date:  new Date().toISOString().slice(0, 10),
      p_doc_id:         receipt.id,
      p_doc_type:       'receipt',
      p_description:    `Кредиторка: ${po.doc_number}`,
      p_created_by:     user.email,
    });
  }

  return NextResponse.json({ ok: true, receiptId: receipt.id });
}
