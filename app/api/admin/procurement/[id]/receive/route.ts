import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../../lib/supabase';
import { createDocument, confirmDocument, maybeAutoClose } from '../../../../../../lib/accounting/documents';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await req.json() as {
    actualQties?:       Record<string, number>;
    actualPrices?:      Record<string, number>;
    sale_prices?:       Record<string, number>;  // роздріб
    wholesale_prices?:  Record<string, number>;  // опт
    drop_prices?:       Record<string, number>;  // дроп
    notes?:             string;
    draft?:             boolean;
    draftReceiptId?:    string;
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

  // Delete old draft receipt if replacing it
  if (body.draftReceiptId) {
    await db.from('acc_document_lines').delete().eq('document_id', body.draftReceiptId);
    await db.from('acc_documents').delete().eq('id', body.draftReceiptId).eq('status', 'draft');
  }

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
      price:            body.sale_prices?.[l.sku] ?? 0,
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

  if (body.draft) {
    // Draft mode: do not confirm, do not update PO status
    return NextResponse.json({ ok: true, receiptId: receipt.id, draft: true });
  }

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

  if (allReceived) await maybeAutoClose(id);

  // Якщо вказані ціни продажу — фіксуємо їх в product_stock і блокуємо від перезапису синком
  const skusWithPrices = [...new Set([
    ...Object.keys(body.sale_prices      ?? {}).filter(s => (body.sale_prices![s]      ?? 0) > 0),
    ...Object.keys(body.wholesale_prices ?? {}).filter(s => (body.wholesale_prices![s] ?? 0) > 0),
    ...Object.keys(body.drop_prices      ?? {}).filter(s => (body.drop_prices![s]      ?? 0) > 0),
  ])];

  if (skusWithPrices.length > 0) {
    await Promise.allSettled(skusWithPrices.map(sku => {
      const retail    = body.sale_prices?.[sku]      ?? 0;
      const wholesale = body.wholesale_prices?.[sku] ?? 0;
      const drop      = body.drop_prices?.[sku]      ?? 0;
      const row: Record<string, unknown> = { sku, price_locked: true };
      if (retail    > 0) row.price_retail = retail;
      if (wholesale > 0) row.price_unit   = wholesale;
      if (drop      > 0) row.price_drop   = drop;
      return db.from('product_stock').upsert(row, { onConflict: 'sku' });
    }));
  }

  return NextResponse.json({ ok: true, receiptId: receipt.id, draft: false });
}
