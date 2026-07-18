import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { createDocument, confirmDocument } from '../../../../../../lib/accounting/documents';
import { createServiceClient } from '../../../../../../lib/supabase';

const db = createServiceClient();

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: poId } = await params;
  const body = await req.json() as {
    reason: string;
    lines: { sku: string; original_qty: number; new_qty: number; original_price?: number; new_price?: number }[];
  };

  if (!body.reason || !body.lines?.length) {
    return NextResponse.json({ error: 'Причина і рядки обов\'язкові' }, { status: 400 });
  }

  const { data: po } = await db
    .from('acc_documents')
    .select('id, warehouse_id, supplier_id, status')
    .eq('id', poId).single();

  if (!po) return NextResponse.json({ error: 'PO не знайдено' }, { status: 404 });
  if (po.status !== 'confirmed') return NextResponse.json({ error: 'Можна коригувати тільки підтверджені замовлення' }, { status: 409 });

  const doc = await createDocument({
    doc_type:     'purchase_order_adjustment',
    warehouse_id: po.warehouse_id,
    supplier_id:  po.supplier_id ?? undefined,
    notes:        body.reason,
    created_by:   user.email ?? 'admin',
    meta:         { parent_po_id: poId },
    lines: body.lines.map(l => ({
      sku:           l.sku,
      qty:           l.new_qty - l.original_qty,  // delta
      price:         l.new_price ?? l.original_price ?? 0,
      cost_price:    l.new_price ?? l.original_price ?? 0,
      original_qty:  l.original_qty,
      adjusted_qty:  l.new_qty,
      fulfillment_type: 'dropship' as const,
    })),
  });

  // Set parent link + confirm immediately (no stock movement for adjustment)
  await db.from('acc_documents').update({ parent_doc_id: poId }).eq('id', doc.id);
  await confirmDocument(doc.id, user.email ?? 'admin');

  return NextResponse.json({ id: doc.id, doc_number: doc.doc_number });
}
