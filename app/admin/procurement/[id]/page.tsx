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
      .select('id, doc_number, doc_date')
      .eq('parent_doc_id', id)
      .eq('doc_type', 'purchase_order_adjustment')
      .eq('status', 'confirmed'),
  ]);

  // Рядки коригувань (дельти + нові позиції)
  const adjIds = (adjDocs ?? []).map((a: { id: string }) => a.id);
  const [{ data: adjLines }, { data: receiptDocs }, { data: paymentEntries }] = await Promise.all([
    adjIds.length
      ? db.from('acc_document_lines').select('sku, qty, cost_price').in('document_id', adjIds)
      : Promise.resolve({ data: [] as { sku: string; qty: number; cost_price: number }[] }),
    db.from('acc_documents')
      .select('id, doc_number, doc_date')
      .eq('parent_doc_id', id).eq('status', 'confirmed').in('doc_type', ['receipt', 'stock_in']),
    db.from('money_entries')
      .select('created_at, amount, doc_type, description, account_type, meta, txn_id')
      .eq('doc_id', id)
      .in('account_type', ['supplier', 'bank', 'cash', 'acquiring'])
      .in('doc_type', ['supplier_payment', 'supplier_payment_reversal'])
      .order('created_at'),
  ]);

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

  // Замовлення клієнта (якщо PO створено з конкретного замовлення)
  const { data: customerOrder } = poBase.order_id
    ? await db.from('orders')
        .select('order_number, contact, company, status, total_price')
        .eq('id', poBase.order_id)
        .single()
    : { data: null };

  // Чернетка — редіректимо до списку (відкривається через модаль)
  if (poBase.procurement_status === 'draft') {
    redirect('/admin/procurement');
  }

  const receiptCount = (receiptDocs ?? []).length;

  // Чернетка приходу (незавершений прихід від цього PO)
  const { data: draftReceiptDocRow } = await db
    .from('acc_documents').select('id')
    .eq('parent_doc_id', id).eq('status', 'draft').in('doc_type', ['receipt'])
    .maybeSingle();

  const draftReceiptId = draftReceiptDocRow?.id ?? null;

  const { data: draftReceiptLines } = draftReceiptId
    ? await db.from('acc_document_lines')
        .select('sku, qty, cost_price, price')
        .eq('document_id', draftReceiptId)
    : { data: [] as { sku: string; qty: number; cost_price: number; price: number }[] };

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
    has_receipt:    receiptCount > 0,
    receipt_id:     (receiptDocs ?? [])[0]?.id ?? null,
    receipt_doc_number: (receiptDocs ?? [])[0]?.doc_number ?? null,
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
    draft_receipt_id:    draftReceiptId,
    draft_receipt_lines: (draftReceiptLines ?? []).map(l => ({
      sku:        l.sku,
      qty:        Number(l.qty ?? 0),
      cost_price: Number(l.cost_price ?? 0),
      price:      Number(l.price ?? 0),
    })),
  };

  const poLines = (lines ?? []).map((l: { sku: string; qty: number; cost_price: number }) => ({
    sku:        l.sku,
    qty:        l.qty,
    cost_price: Number(l.cost_price ?? 0),
    name:       nameMap.get(l.sku)?.name  ?? '',
    brand:      nameMap.get(l.sku)?.brand ?? '',
  }));

  const isDraft      = po.procurement_status === 'draft';
  const isCancelled  = po.status === 'cancelled';

  const hasSubordinateDocs = po.has_receipt || (adjDocs ?? []).length > 0;

  // Журнал подій — всі ключові події хронологічно
  type ActivityEvent = { icon: string; label: string; detail?: string; date: string | null; isDatetime: boolean };
  const events: ActivityEvent[] = [];

  // Платіжна історія для відображення в компоненті
  type PaymentHistoryEntry = { created_at: string; amount: number; payment_mode: string | null; doc_type: string };
  const allEntries = (paymentEntries ?? []) as { created_at: string; amount: number; doc_type: string; description: string | null; account_type: string; meta?: Record<string, unknown> | null; txn_id?: string }[];

  // Визначаємо тип оплати з кредитної ноги (cash/bank/acquiring) бо meta може бути пустою
  const txnCreditAccount = new Map<string, string>();
  for (const e of allEntries) {
    if (e.txn_id && Number(e.amount) < 0 && ['cash','bank','acquiring'].includes(e.account_type)) {
      txnCreditAccount.set(e.txn_id, e.account_type);
    }
  }
  function payModeFromTxn(e: typeof allEntries[0]): string | null {
    const mode = e.meta?.payment_mode as string | null;
    if (mode) return mode;
    if (e.txn_id) {
      const acct = txnCreditAccount.get(e.txn_id);
      if (acct === 'cash') return 'cash';
      if (acct === 'bank') return 'transfer';
      if (acct === 'acquiring') return 'acquiring';
    }
    return null;
  }

  const paymentHistory: PaymentHistoryEntry[] = allEntries
    .filter(e => e.doc_type === 'supplier_payment' && e.account_type === 'supplier' && Number(e.amount) > 0)
    .map(e => ({
      created_at:   e.created_at,
      amount:       Number(e.amount),
      payment_mode: payModeFromTxn(e),
      doc_type:     e.doc_type,
    }));
  const totalPaid = paymentHistory.reduce((s, e) => s + e.amount, 0);

  events.push({ icon: '📋', label: 'Замовлення проведено', detail: po.doc_number, date: po.doc_date, isDatetime: false });

  for (const adj of (adjDocs ?? []) as { id: string; doc_number: string; doc_date: string }[]) {
    events.push({ icon: '📝', label: 'Коригування', detail: adj.doc_number, date: adj.doc_date, isDatetime: false });
  }

  if (po.email_sent_at) {
    events.push({ icon: '📤', label: 'Email відправлено постачальнику', date: po.email_sent_at, isDatetime: true });
  }

  if (po.supplier_invoice_date) {
    events.push({ icon: '🧾', label: 'Рахунок-фактура', detail: po.supplier_invoice_number ?? undefined, date: po.supplier_invoice_date, isDatetime: false });
  }

  for (const r of (receiptDocs ?? []) as { id: string; doc_number: string; doc_date: string }[]) {
    events.push({ icon: '📦', label: 'Прихід оприходований', detail: r.doc_number, date: r.doc_date, isDatetime: false });
  }

  for (const p of allEntries) {
    if (p.doc_type === 'supplier_payment' && p.account_type === 'supplier' && Number(p.amount) > 0) {
      const mode = payModeFromTxn(p);
      const icon = mode === 'cash' ? '💵' : mode === 'transfer' ? '🏦' : mode === 'acquiring' ? '💳' : '💳';
      events.push({ icon, label: 'Оплата проведена', detail: `${Math.abs(Number(p.amount)).toLocaleString('uk-UA', { minimumFractionDigits: 2 })} ₴`, date: p.created_at, isDatetime: true });
    } else if (p.doc_type === 'supplier_payment_reversal' && p.account_type === 'supplier') {
      events.push({ icon: '↩️', label: 'Оплату скасовано', date: p.created_at, isDatetime: true });
    }
  }

  if (isCancelled) {
    events.push({ icon: '🚫', label: 'Замовлення скасовано', date: null, isDatetime: false });
  }

  events.sort((a, b) => {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date < b.date ? -1 : 1;
  });

  return <ProcurementDetail
    po={po}
    customerOrder={customerOrder ?? null}
    events={events}
    paymentHistory={paymentHistory}
    totalPaid={totalPaid}
    adjustmentButton={
      !isDraft && !isCancelled ? (
        <div style={{ display: 'flex', gap: '8px' }}>
          {!po.has_receipt && <AdjustmentButton key="adj" poId={id} lines={poLines} />}
          {po.has_receipt && po.procurement_status !== 'received' && <AdditionalReceiptButton key="add-rcpt" poId={id} supplierName={po.supplier_name} />}
        </div>
      ) : isDraft ? (
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
      ) : null
    }
    chainButton={!isDraft && hasSubordinateDocs ? <DocChain poId={id} /> : null}
  />;
}
