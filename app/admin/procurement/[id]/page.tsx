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

  const [{ data: poBase }, { data: lines }] = await Promise.all([
    db.from('acc_documents')
      .select('*, supplier:supplier_id(name, email, bank_iban, bank_name, legal_name, edrpou, payment_days)')
      .eq('id', id)
      .eq('doc_type', 'purchase_order')
      .single(),
    db.from('acc_document_lines')
      .select('*')
      .eq('document_id', id)
      .order('sort_order'),
  ]);

  // Назви товарів
  const skus = (lines ?? []).map((l: { sku: string }) => l.sku).filter(Boolean);
  const { data: products } = skus.length
    ? await db.from('products').select('sku, name, brand').in('sku', skus)
    : { data: [] };
  const nameMap = new Map((products ?? []).map(p => [p.sku, { brand: p.brand ?? '', name: p.name ?? '' }]));

  if (!poBase) notFound();

  // Чернетка — редіректимо до списку (відкривається через модаль)
  if (poBase.procurement_status === 'draft') {
    redirect('/admin/procurement');
  }

  const { count: receiptCount } = await db
    .from('acc_documents')
    .select('*', { count: 'exact', head: true })
    .eq('parent_doc_id', id)
    .eq('status', 'confirmed');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sup = poBase.supplier as any;
  const po = {
    ...poBase,
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
    lines:          (lines ?? []).map((l: { sku: string; qty: number; cost_price: number; supplier_id?: number; warehouse_id?: number; id: number }) => ({
      ...l,
      name:  nameMap.get(l.sku)?.name  ?? '',
      brand: nameMap.get(l.sku)?.brand ?? '',
    })),
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
