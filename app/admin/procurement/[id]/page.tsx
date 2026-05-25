import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { redirect, notFound } from 'next/navigation';
import ProcurementDetail from './ProcurementDetail';
import DocChain from './DocChain';
import AdditionalReceiptButton from './AdditionalReceiptButton';
import AdjustmentButton from './AdjustmentButton';
import EditDraftButton from './EditDraftButton';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function ProcurementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') redirect('/');

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
    // Коригування для цього PO
    db.from('acc_documents')
      .select('id')
      .eq('parent_doc_id', id)
      .eq('doc_type', 'purchase_order_adjustment')
      .eq('status', 'confirmed'),
  ]);

  // Рядки коригувань (дельти + нові позиції)
  const adjIds = (adjDocs ?? []).map((a: { id: string }) => a.id);
  const { data: adjLines } = adjIds.length
    ? await db.from('acc_document_lines').select('sku, qty, cost_price').in('document_id', adjIds)
    : { data: [] };

  // Ефективна кількість = original + Σ delta
  const adjDeltaMap: Record<string, number> = {};
  const adjCostMap: Record<string, number>  = {};
  for (const l of (adjLines ?? []) as { sku: string; qty: number; cost_price: number }[]) {
    adjDeltaMap[l.sku] = (adjDeltaMap[l.sku] ?? 0) + l.qty;
    if (l.cost_price) adjCostMap[l.sku] = l.cost_price;
  }

  // Нові позиції з коригувань (не в оригінальних рядках PO)
  const originalSkus = new Set((lines ?? []).map((l: { sku: string }) => l.sku));
  const newAdjSkus   = [...new Set(Object.keys(adjDeltaMap).filter(sku => !originalSkus.has(sku)))];

  // Назви товарів (оригінальні + нові з коригувань)
  const allSkus = [...(lines ?? []).map((l: { sku: string }) => l.sku), ...newAdjSkus].filter(Boolean);
  const { data: products } = allSkus.length
    ? await db.from('products').select('sku, name, brand').in('sku', allSkus)
    : { data: [] };
  const nameMap = new Map((products ?? []).map(p => [p.sku, { brand: p.brand ?? '', name: p.name ?? '' }]));

  if (!poBase) notFound();

  // Чернетка — редіректимо до списку (відкривається через модаль)
  if (poBase.procurement_status === 'draft') {
    redirect('/admin/procurement');
  }

  // Чи є розподілені Landed Costs для дочірніх документів
  const { data: receiptDocs } = await db
    .from('acc_documents').select('id, doc_number')
    .eq('parent_doc_id', id).eq('status', 'confirmed').in('doc_type', ['receipt', 'stock_in']);
  const receiptIds = (receiptDocs ?? []).map((r: { id: string }) => r.id);
  const { data: existingLcLines } = receiptIds.length
    ? await db.from('landed_cost_lines')
        .select('id, cost_type, description, amount, distributed')
        .in('document_id', receiptIds)
    : { data: [] };
  const lcAlreadyDone = (existingLcLines ?? []).some((l: { distributed: boolean }) => l.distributed);

  // Рахуємо тільки приходи (не коригування!)
  const { count: receiptCount } = await db
    .from('acc_documents')
    .select('*', { count: 'exact', head: true })
    .eq('parent_doc_id', id)
    .eq('status', 'confirmed')
    .in('doc_type', ['receipt', 'stock_in']);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sup = poBase.supplier as any;
  const po = {
    ...poBase,
    status:         poBase.status ?? null,
    supplier_name:  sup?.name  ?? null,
    supplier_email: sup?.email ?? null,
    supplier_bank:  sup ? {
      bank_iban:    sup.bank_iban   ?? null,
      bank_name:    sup.bank_name   ?? null,
      legal_name:   sup.legal_name  ?? null,
      edrpou:       sup.edrpou      ?? null,
      payment_days: sup.payment_days ?? 0,
    } : null,
    has_receipt:    (receiptCount ?? 0) > 0,
    receipt_id:     (receiptDocs ?? [])[0]?.id ?? null,
    receipt_doc_number: (receiptDocs ?? [])[0]?.doc_number ?? null,
    lc_done:        lcAlreadyDone,
    lc_lines:       existingLcLines ?? [],
    lines: [
      // Оригінальні рядки PO
      ...(lines ?? []).map((l: { sku: string; qty: number; cost_price: number; supplier_id?: number; warehouse_id?: number; id: number }) => ({
        ...l,
        name:         nameMap.get(l.sku)?.name  ?? '',
        brand:        nameMap.get(l.sku)?.brand ?? '',
        adj_delta:    adjDeltaMap[l.sku] ?? 0,
        effective_qty: l.qty + (adjDeltaMap[l.sku] ?? 0),
        is_adj_new:   false,
      })),
      // Нові позиції додані через коригування
      ...newAdjSkus.filter(sku => adjDeltaMap[sku] > 0).map((sku, i) => ({
        id:           -(i + 1),  // від'ємний id = нова позиція
        sku,
        qty:          0,
        cost_price:   adjCostMap[sku] ?? 0,
        name:         nameMap.get(sku)?.name  ?? '',
        brand:        nameMap.get(sku)?.brand ?? '',
        adj_delta:    adjDeltaMap[sku],
        effective_qty: adjDeltaMap[sku],
        is_adj_new:   true,
        sort_order:   999 + i,
      })),
    ],
  };

  const poLines = (lines ?? []).map((l: { sku: string; qty: number; cost_price: number }) => ({
    sku:        l.sku,
    qty:        l.qty,
    cost_price: Number(l.cost_price ?? 0),
    name:       nameMap.get(l.sku)?.name  ?? '',
    brand:      nameMap.get(l.sku)?.brand ?? '',
  }));

  const isDraft = po.procurement_status === 'draft';

  return <ProcurementDetail po={po} chainButton={
    <div style={{ display: 'flex', gap: '8px' }}>
      {isDraft && (
        <EditDraftButton
          poId={id}
          supplierId={po.supplier_id ?? 0}
          supplierName={po.supplier_name ?? ''}
          expectedDate={po.expected_date ?? ''}
          notes={po.notes ?? ''}
          lines={(lines ?? []).map((l: { sku: string; qty: number; cost_price: number; id: number }) => ({
            sku:        l.sku,
            name:       nameMap.get(l.sku)?.name  ?? '',
            brand:      nameMap.get(l.sku)?.brand ?? '',
            qty:        l.qty,
            cost_price: Number(l.cost_price ?? 0),
            matched:    nameMap.has(l.sku),
          }))}
        />
      )}
      {!isDraft && <AdjustmentButton poId={id} lines={poLines} />}
      {!isDraft && <AdditionalReceiptButton poId={id} supplierName={po.supplier_name} />}
      {!isDraft && <DocChain poId={id} />}
    </div>
  } />;
}
