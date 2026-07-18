import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../../lib/supabase';

const db = createServiceClient();

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: poId } = await params;

  // PO lines (ordered quantities)
  const { data: poLines } = await db
    .from('acc_document_lines')
    .select('sku, qty, cost_price, supplier_id, warehouse_id')
    .eq('document_id', poId);

  if (!poLines?.length) return NextResponse.json({ remaining: [], hasRemaining: false });

  // Find all confirmed receipts for this PO
  const { data: receipts } = await db
    .from('acc_documents')
    .select('id')
    .eq('parent_doc_id', poId)
    .eq('status', 'confirmed')
    .in('doc_type', ['receipt', 'stock_in']);

  const receiptIds = (receipts ?? []).map(r => r.id);

  // Sum received quantities per SKU
  const receivedMap = new Map<string, number>();
  if (receiptIds.length > 0) {
    const { data: receivedLines } = await db
      .from('acc_document_lines')
      .select('sku, qty')
      .in('document_id', receiptIds);

    for (const line of receivedLines ?? []) {
      receivedMap.set(line.sku, (receivedMap.get(line.sku) ?? 0) + Number(line.qty));
    }
  }

  // Product names
  const skus = poLines.map(l => l.sku);
  const { data: products } = await db.from('products').select('sku, name, brand').in('sku', skus);
  const nameMap = new Map((products ?? []).map(p => [p.sku, `${p.brand ?? ''} ${p.name ?? ''}`.trim()]));

  // Supplier / warehouse defaults (from first PO line)
  const defaultSupplierId  = poLines[0]?.supplier_id  ?? null;
  const defaultWarehouseId = poLines[0]?.warehouse_id ?? null;

  // Calculate remaining
  const remaining = poLines
    .map(line => ({
      sku:           line.sku,
      name:          nameMap.get(line.sku) ?? '',
      ordered_qty:   Number(line.qty),
      received_qty:  receivedMap.get(line.sku) ?? 0,
      remaining_qty: Number(line.qty) - (receivedMap.get(line.sku) ?? 0),
      cost_price:    Number(line.cost_price ?? 0),
      supplier_id:   line.supplier_id,
      warehouse_id:  line.warehouse_id,
    }))
    .filter(l => l.remaining_qty > 0);

  return NextResponse.json({ remaining, hasRemaining: remaining.length > 0, defaultSupplierId, defaultWarehouseId });
}
