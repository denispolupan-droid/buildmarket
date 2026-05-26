import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../../lib/supabase';

const db = createServiceClient();

// GET /api/admin/procurement/[id]/detail — повні дані ПО для drawer
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const [{ data: poBase }, { data: lines }, { data: adjDocs }] = await Promise.all([
    db.from('acc_documents')
      .select('*, supplier:supplier_id(name, email, bank_iban, bank_name, legal_name, edrpou, payment_days)')
      .eq('id', id)
      .eq('doc_type', 'purchase_order')
      .single(),
    db.from('acc_document_lines')
      .select('*')
      .eq('document_id', id)
      .order('sort_order'),
    db.from('acc_documents')
      .select('id')
      .eq('parent_doc_id', id)
      .eq('doc_type', 'purchase_order_adjustment')
      .eq('status', 'confirmed'),
  ]);

  if (!poBase) return NextResponse.json({ error: 'Не знайдено' }, { status: 404 });

  // Коригування
  const adjIds = (adjDocs ?? []).map((a: { id: string }) => a.id);
  const { data: adjLines } = adjIds.length
    ? await db.from('acc_document_lines').select('sku, qty, cost_price').in('document_id', adjIds)
    : { data: [] };

  const adjDeltaMap: Record<string, number> = {};
  const adjCostMap: Record<string, number>  = {};
  for (const l of (adjLines ?? []) as { sku: string; qty: number; cost_price: number }[]) {
    adjDeltaMap[l.sku] = (adjDeltaMap[l.sku] ?? 0) + l.qty;
    if (l.cost_price) adjCostMap[l.sku] = l.cost_price;
  }

  const originalSkus = new Set((lines ?? []).map((l: { sku: string }) => l.sku));
  const newAdjSkus   = [...new Set(Object.keys(adjDeltaMap).filter(sku => !originalSkus.has(sku)))];
  const allSkus      = [...(lines ?? []).map((l: { sku: string }) => l.sku), ...newAdjSkus].filter(Boolean);

  const { data: products } = allSkus.length
    ? await db.from('products').select('sku, name, brand').in('sku', allSkus)
    : { data: [] };
  const nameMap = new Map((products ?? []).map(p => [p.sku, { brand: p.brand ?? '', name: p.name ?? '' }]));

  // Приходи
  const { data: receiptDocs } = await db
    .from('acc_documents').select('id, doc_number')
    .eq('parent_doc_id', id).eq('status', 'confirmed').in('doc_type', ['receipt', 'stock_in']);
  const receiptIds = (receiptDocs ?? []).map((r: { id: string }) => r.id);

  const receiptCount = receiptIds.length;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sup = poBase.supplier as any;

  const po = {
    ...poBase,
    status:         poBase.status ?? null,
    supplier_name:  sup?.name  ?? null,
    supplier_email: sup?.email ?? null,
    supplier_bank:  sup ? {
      bank_iban:    sup.bank_iban    ?? null,
      bank_name:    sup.bank_name    ?? null,
      legal_name:   sup.legal_name   ?? null,
      edrpou:       sup.edrpou       ?? null,
      payment_days: sup.payment_days ?? 0,
    } : null,
    has_receipt:        receiptCount > 0,
    receipt_id:         (receiptDocs ?? [])[0]?.id ?? null,
    receipt_doc_number: (receiptDocs ?? [])[0]?.doc_number ?? null,
    lines: [
      ...(lines ?? []).map((l: { sku: string; qty: number; cost_price: number; supplier_id?: number; warehouse_id?: number; id: number }) => ({
        ...l,
        name:          nameMap.get(l.sku)?.name  ?? '',
        brand:         nameMap.get(l.sku)?.brand ?? '',
        adj_delta:     adjDeltaMap[l.sku] ?? 0,
        effective_qty: l.qty + (adjDeltaMap[l.sku] ?? 0),
        is_adj_new:    false,
      })),
      ...newAdjSkus.filter(sku => adjDeltaMap[sku] > 0).map((sku, i) => ({
        id:            -(i + 1),
        sku,
        qty:           0,
        cost_price:    adjCostMap[sku] ?? 0,
        name:          nameMap.get(sku)?.name  ?? '',
        brand:         nameMap.get(sku)?.brand ?? '',
        adj_delta:     adjDeltaMap[sku],
        effective_qty: adjDeltaMap[sku],
        is_adj_new:    true,
        sort_order:    999 + i,
      })),
    ],
    // Для AdjustmentButton
    poLines: (lines ?? []).map((l: { sku: string; qty: number; cost_price: number }) => ({
      sku:        l.sku,
      qty:        l.qty,
      cost_price: Number(l.cost_price ?? 0),
      name:       nameMap.get(l.sku)?.name  ?? '',
      brand:      nameMap.get(l.sku)?.brand ?? '',
    })),
  };

  return NextResponse.json(po);
}
