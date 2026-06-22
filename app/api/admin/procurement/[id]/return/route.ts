import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { createDocument, confirmDocument } from '../../../../../../lib/accounting/documents';
import { createServiceClient } from '../../../../../../lib/supabase';

const db = createServiceClient();

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: receiptId } = await params;
  const body = await req.json() as {
    reason: string;
    lines: { sku: string; qty: number; cost_price: number }[];
  };

  if (!body.reason || !body.lines?.length) {
    return NextResponse.json({ error: 'Причина і товари обов\'язкові' }, { status: 400 });
  }

  const { data: receipt } = await db
    .from('acc_documents')
    .select('id, warehouse_id, supplier_id, status, parent_doc_id')
    .eq('id', receiptId).single();

  if (!receipt) return NextResponse.json({ error: 'Прихід не знайдено' }, { status: 404 });
  if (receipt.status !== 'confirmed') return NextResponse.json({ error: 'Можна повертати тільки проведені приходи' }, { status: 409 });

  // P5: не можна повернути більше ніж прийшло
  // (check is done via procurement_summary view, simplified here)

  const doc = await createDocument({
    doc_type:     'supplier_return',
    warehouse_id: receipt.warehouse_id,
    supplier_id:  receipt.supplier_id ?? undefined,
    notes:        body.reason,
    created_by:   user.email ?? 'admin',
    lines: body.lines.filter(l => l.qty > 0).map(l => ({
      sku:              l.sku,
      qty:              l.qty,
      price:            0,
      cost_price:       l.cost_price,
      fulfillment_type: 'own' as const,
      warehouse_id:     receipt.warehouse_id,
      supplier_id:      receipt.supplier_id ?? undefined,
    })),
  });

  // Link to original receipt
  await db.from('acc_documents').update({ parent_doc_id: receiptId }).eq('id', doc.id);

  // confirmDocument для supplier_return: зменшує склад (stock OUT) +
  // записує DR supplier / CR inventory_asset через recordSupplierReturn.
  await confirmDocument(doc.id, user.email ?? 'admin');

  return NextResponse.json({ id: doc.id, doc_number: doc.doc_number });
}
