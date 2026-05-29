import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { createDocument } from '../../../../lib/accounting/documents';
import { createServiceClient } from '../../../../lib/supabase';

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const db = createServiceClient();
  const body = await req.json() as {
    supplier_id:    number;
    expected_date?: string;
    notes?:         string;
    order_id?:      string;   // ID замовлення покупця, якщо ЗП створено на основі замовлення
    parent_doc_id?: string;   // якщо це додатковий прихід до існуючого PO
    is_receipt?:    boolean;  // створити як прихід (receipt), а не PO
    conduct?:       boolean;  // одразу провести (procurement_status: 'new')
    lines: { sku: string; qty: number; cost_price: number }[];
  };

  if (!body.supplier_id || !body.lines?.length) {
    return NextResponse.json({ error: 'Постачальник і товари обов\'язкові' }, { status: 400 });
  }

  // Get default warehouse
  const { data: warehouse } = await db
    .from('warehouses').select('id').eq('is_default', true).single();
  if (!warehouse) return NextResponse.json({ error: 'Склад не налаштовано' }, { status: 500 });

  // Якщо is_receipt — створюємо прихід (receipt) і одразу проводимо
  if (body.is_receipt) {
    const { confirmDocument } = await import('../../../../lib/accounting/documents');
    const receipt = await createDocument({
      doc_type:     'receipt',
      warehouse_id: warehouse.id,
      supplier_id:  body.supplier_id,
      notes:        body.notes ?? 'Додатковий прихід',
      created_by:   user.email ?? 'admin',
      lines: body.lines.map(l => ({
        sku: l.sku, qty: l.qty, price: 0, cost_price: l.cost_price,
        fulfillment_type: 'own' as const,
        supplier_id: body.supplier_id, warehouse_id: warehouse.id,
      })),
    });
    // Link to parent PO
    if (body.parent_doc_id) {
      await db.from('acc_documents').update({ parent_doc_id: body.parent_doc_id }).eq('id', receipt.id);
    }
    await confirmDocument(receipt.id, user.email ?? 'admin');

    // After additional receipt — update parent PO status based on remaining items
    if (body.parent_doc_id) {
      const { data: poLines } = await db
        .from('acc_document_lines').select('sku, qty').eq('document_id', body.parent_doc_id);

      const { data: allReceiptDocs } = await db
        .from('acc_documents').select('id')
        .eq('parent_doc_id', body.parent_doc_id).eq('status', 'confirmed')
        .in('doc_type', ['receipt', 'stock_in']);

      const rIds = (allReceiptDocs ?? []).map((r: { id: string }) => r.id);
      const receivedMap = new Map<string, number>();
      if (rIds.length > 0) {
        const { data: rLines } = await db
          .from('acc_document_lines').select('sku, qty').in('document_id', rIds);
        for (const l of rLines ?? []) {
          receivedMap.set(l.sku, (receivedMap.get(l.sku) ?? 0) + Number(l.qty));
        }
      }

      const allReceived = (poLines ?? []).every((l: { sku: string; qty: number }) =>
        (receivedMap.get(l.sku) ?? 0) >= Number(l.qty)
      );
      await db.from('acc_documents')
        .update({ procurement_status: allReceived ? 'received' : 'partially_received' })
        .eq('id', body.parent_doc_id);

      if (allReceived) {
        const { maybeAutoClose } = await import('../../../../lib/accounting/documents');
        await maybeAutoClose(body.parent_doc_id);
      }
    }

    return NextResponse.json({ receiptId: receipt.id, doc_number: receipt.doc_number }, { status: 201 });
  }

  const doc = await createDocument({
    doc_type:      'purchase_order',
    warehouse_id:  warehouse.id,
    supplier_id:   body.supplier_id,
    expected_date: body.expected_date ?? undefined,
    notes:         body.notes ?? undefined,
    created_by:    user.email ?? 'admin',
    lines: body.lines.map(l => ({
      sku:              l.sku,
      qty:              l.qty,
      price:            0,
      cost_price:       l.cost_price,
      fulfillment_type: 'dropship' as const,
      supplier_id:      body.supplier_id,
      warehouse_id:     warehouse.id,
    })),
  });

  const total = body.lines.reduce((s, l) => s + l.qty * l.cost_price, 0);
  const { error: updateErr } = await db.from('acc_documents').update({
    status:             'confirmed',
    confirmed_at:       new Date().toISOString(),
    confirmed_by:       user.email,
    procurement_status: body.conduct ? 'ordered' : 'draft',
    total_amount:       total,
    total_cost:         total,
    ...(body.order_id ? { order_id: body.order_id } : {}),
  }).eq('id', doc.id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ id: doc.id, doc_number: doc.doc_number }, { status: 201 });
}
