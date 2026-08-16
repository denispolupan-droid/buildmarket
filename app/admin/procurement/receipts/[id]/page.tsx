import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, X } from 'lucide-react';
import DocChain from '../../[id]/DocChain';
import PrintButton from '../../../components/PrintButton';
import ReceiptActionsMenu from '../../[id]/ReceiptActionsMenu';
import LandedCostHeaderButton from './LandedCostHeaderButton';
import EditPricesButton from './EditPricesButton';
import ReceiptPaymentPanel from './ReceiptPaymentPanel';
import { procurementPaymentOr } from '../../../../../lib/accounting/procurement-payments';

export const dynamic = 'force-dynamic';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const COST_TYPE_LABELS: Record<string, string> = {
  delivery: '🚚 Доставка', loading: '📦 Навант./розвант.',
  customs: '🏛 Мито/брокер', packaging: '📦 Пакування', other: '➕ Інше',
};

function fmt(n: number) { return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export default async function ReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

  const { id } = await params;

  const [{ data: doc }, { data: lines }] = await Promise.all([
    db.from('acc_documents')
      .select('*, supplier:supplier_id(name), warehouse:warehouse_id(name), parent_doc:parent_doc_id(id, doc_number, doc_date, doc_type)')
      .eq('id', id).single(),
    db.from('acc_document_lines')
      .select('*').eq('document_id', id).order('sort_order'),
  ]);

  if (!doc || !['receipt','stock_in'].includes(doc.doc_type)) notFound();

  const skus = (lines ?? []).map((l: { sku: string }) => l.sku).filter(Boolean);
  const { data: products } = skus.length
    ? await db.from('products').select('sku, name, brand').in('sku', skus)
    : { data: [] };
  const nameMap = new Map((products ?? []).map(p => [p.sku, `${p.brand} ${p.name}`.trim()]));

  const isStandalone = !doc.parent_doc_id;

  const [
    { data: landedCosts },
    { data: batches },
    { data: poLines },
    { data: paymentEntries },
  ] = await Promise.all([
    db.from('landed_cost_lines').select('*').eq('document_id', id),
    db.from('stock_batches').select('sku, initial_qty, cost_price').eq('document_id', id),
    doc.parent_doc_id
      ? db.from('acc_document_lines').select('sku, cost_price').eq('document_id', doc.parent_doc_id)
      : Promise.resolve({ data: [] as { sku: string; cost_price: number }[] }),
    // Оплати по цьому ПН (тільки для standalone)
    isStandalone
      ? db.from('money_entries')
          .select('created_at, amount, doc_type, account_type, meta, txn_id')
          .or(procurementPaymentOr(id))
          .in('account_type', ['supplier', 'bank', 'cash', 'acquiring'])
          .in('doc_type', ['supplier_payment', 'supplier_payment_reversal'])
          .order('created_at')
      : Promise.resolve({ data: [] as { created_at: string; amount: number; doc_type: string; account_type: string; meta: Record<string, unknown> | null; txn_id?: string }[] }),
  ]);

  const originalPriceMap = new Map((poLines ?? []).map(l => [l.sku, Number(l.cost_price ?? 0)]));
  const finalPriceMap    = new Map((batches ?? []).map(b => [b.sku, Number(b.cost_price)]));

  const hasLC        = (landedCosts ?? []).length > 0;
  const totalLC      = (landedCosts ?? []).reduce((s: number, l: { amount: number }) => s + Number(l.amount), 0);

  // totalCost — сума рядків БЕЗ landed cost (оригінальні ціни з PO, або рядки якщо немає LC)
  // ВАЖЛИВО: apply_landed_costs() оновлює acc_document_lines.cost_price «на місці»,
  // тому читати totalCost з рядків приходу = вже включено LC → подвоєння!
  const totalCost = (lines ?? []).reduce((s: number, l: { sku: string; qty: number; cost_price: number }) => {
    const origPrice = hasLC ? (originalPriceMap.get(l.sku) ?? Number(l.cost_price ?? 0)) : Number(l.cost_price ?? 0);
    return s + l.qty * origPrice;
  }, 0);
  // totalAfterLC — фінальна собівартість з FIFO-партій (включає розподілений LC)
  const totalAfterLC = hasLC
    ? (batches ?? []).reduce((s: number, b: { initial_qty: number; cost_price: number }) => s + b.initial_qty * b.cost_price, 0)
    : totalCost;

  // Платіжна історія (standalone ПН)
  const allPayEntries = (paymentEntries ?? []) as { created_at: string; amount: number; doc_type: string; account_type: string; meta?: Record<string, unknown> | null; txn_id?: string }[];
  const txnCreditAccount = new Map<string, string>();
  for (const e of allPayEntries) {
    if (e.txn_id && Number(e.amount) < 0 && ['cash','bank','acquiring'].includes(e.account_type)) {
      txnCreditAccount.set(e.txn_id, e.account_type);
    }
  }
  const paymentHistory = allPayEntries
    .filter(e => e.doc_type === 'supplier_payment' && e.account_type === 'supplier' && Number(e.amount) > 0)
    .map(e => {
      const mode = (e.meta?.payment_mode as string | null) ?? (() => {
        const acct = e.txn_id ? txnCreditAccount.get(e.txn_id) : null;
        if (acct === 'cash') return 'cash';
        if (acct === 'bank') return 'transfer';
        return null;
      })();
      return { created_at: e.created_at, amount: Number(e.amount), payment_mode: mode };
    });
  const totalPaid = paymentHistory.reduce((s, e) => s + e.amount, 0);

  const supplierName = (doc.supplier as { name?: string } | null)?.name ?? null;
  const warehouseName= (doc.warehouse as { name?: string } | null)?.name ?? null;
  const parentDoc    = doc.parent_doc as { id: string; doc_number: string; doc_date: string; doc_type: string } | null;

  // Check linked customer order (receipt → PO → customer order)
  let linkedOrder: { id: string; order_number: number; status: string } | null = null;
  if (doc.parent_doc_id) {
    const { data: po } = await db.from('acc_documents').select('order_id').eq('id', doc.parent_doc_id).single();
    if ((po as { order_id?: string } | null)?.order_id) {
      const { data: cOrder } = await db.from('orders')
        .select('id, order_number, status').eq('id', (po as { order_id: string }).order_id).single();
      linkedOrder = cOrder ?? null;
    }
  }

  // Count all awaiting_stock orders for the banner
  const { count: awaitingCount } = await db.from('orders')
    .select('id', { count: 'exact', head: true }).eq('status', 'awaiting_stock');

  return (
    <div style={{ padding: '28px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <Link href="/admin/procurement/receipts" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)', textDecoration: 'none' }}>
          <ArrowLeft size={16} />
        </Link>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{doc.doc_number}</h1>
            <span style={{ padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, color: '#15803D', background: '#F0FDF4' }}>Проведено</span>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '3px' }}>
            Прихід товару{supplierName && ` · ${supplierName}`}{warehouseName && ` · ${warehouseName}`}
            {' · '}{new Date(doc.doc_date).toLocaleDateString('uk-UA')}
          </div>
        </div>
        {doc.parent_doc_id && (
          <Link href={`/admin/procurement/${doc.parent_doc_id}`}
            style={{ fontSize: '12px', color: '#1E3A5F', textDecoration: 'none', background: '#EFF4FF', padding: '4px 12px', borderRadius: '6px', fontWeight: 600 }}>
            ↑ Замовлення
          </Link>
        )}
        {doc.parent_doc_id && <DocChain poId={doc.parent_doc_id} />}
        <PrintButton />
        <EditPricesButton
          documentId={id}
          hasLC={hasLC}
          lines={(lines ?? [])
            .filter((l: { is_bonus?: boolean }) => !l.is_bonus)
            .map((l: { sku: string; qty: number; cost_price: number }) => ({
              sku: l.sku,
              name: nameMap.get(l.sku) ?? l.sku,
              qty: Number(l.qty),
              base_price: hasLC
                ? (originalPriceMap.get(l.sku) ?? Number(l.cost_price ?? 0))
                : Number(l.cost_price ?? 0),
              final_price: finalPriceMap.get(l.sku) ?? Number(l.cost_price ?? 0),
            }))}
        />
        {/* ── Додаткові витрати — завжди видима кнопка ── */}
        <LandedCostHeaderButton receiptId={id} hasLC={hasLC} />
        <ReceiptActionsMenu
          receiptId={id}
          docNumber={doc.doc_number}
          hasExistingLC={hasLC}
          lines={(lines ?? []).map((l: { sku: string; qty: number; cost_price: number }) => ({
            sku: l.sku, qty: Number(l.qty), cost_price: Number(l.cost_price ?? 0),
            name: nameMap.get(l.sku),
          }))}
        />
        <Link href="/admin/procurement/receipts" title="Закрити"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: '8px', border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)', textDecoration: 'none', flexShrink: 0 }}>
          <X size={15} />
        </Link>
      </div>

      {/* Awaiting orders alert */}
      {(linkedOrder?.status === 'awaiting_stock' || (awaitingCount ?? 0) > 0) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', marginBottom: '16px', borderRadius: '10px', background: '#F5F3FF', border: '1.5px solid #A78BFA' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '18px' }}>⏳</span>
            <div>
              {linkedOrder?.status === 'awaiting_stock' ? (
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#6D28D9' }}>
                  Замовлення <a href={`/admin?expand=${linkedOrder.id}`} style={{ color: '#7C3AED', textDecoration: 'underline' }}>#{linkedOrder.order_number}</a> очікувало цей товар — переведіть у &ldquo;Збирається&rdquo;
                </div>
              ) : (
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#6D28D9' }}>
                  {awaitingCount} {(awaitingCount ?? 0) === 1 ? 'замовлення очікує товар' : 'замовлень очікують товар'}
                </div>
              )}
              {linkedOrder?.status === 'awaiting_stock' && (awaitingCount ?? 0) > 1 && (
                <div style={{ fontSize: '11px', color: '#7C3AED', marginTop: '2px' }}>
                  Ще {(awaitingCount ?? 0) - 1} інших замовлень в черзі
                </div>
              )}
            </div>
          </div>
          <Link
            href={linkedOrder ? `/admin?expand=${linkedOrder.id}` : '/admin'}
            style={{ height: '32px', padding: '0 14px', borderRadius: '7px', border: '1.5px solid #A78BFA', background: '#EDE9FE', color: '#6D28D9', fontSize: '12px', fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
            Відкрити замовлення →
          </Link>
        </div>
      )}

      {doc.notes && (
        <div style={{ padding: '10px 14px', background: 'var(--bg-soft)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          {parentDoc && doc.notes.includes(parentDoc.doc_number) ? (() => {
            const parts = doc.notes!.split(parentDoc.doc_number);
            const href  = parentDoc.doc_type === 'purchase_order'
              ? `/admin/procurement/${parentDoc.id}`
              : `/admin/accounting/documents/${parentDoc.id}`;
            const date  = new Date(parentDoc.doc_date).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
            return (
              <>
                {parts[0]}
                <Link href={href} style={{ fontWeight: 700, color: '#1D4ED8', textDecoration: 'underline', textUnderlineOffset: '2px' }}>
                  {parentDoc.doc_number}
                </Link>
                <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>· {date}</span>
                {parts.slice(1).join(parentDoc.doc_number)}
              </>
            );
          })() : doc.notes}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isStandalone ? '1fr 360px' : '1fr', gap: '20px', alignItems: 'start' }}>
      <div>
      {/* Товари */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', marginBottom: '16px' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Товари</span>
          {hasLC && <span style={{ fontSize: '11px', fontWeight: 600, color: '#7C3AED', background: '#F5F3FF', padding: '2px 10px', borderRadius: '20px' }}>З урахуванням Landed Cost</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: hasLC ? '110px minmax(0,1fr) 60px 100px 80px 100px 100px' : '120px minmax(0,1fr) 70px 110px 110px', padding: '7px 16px', background: 'var(--bg-soft)', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', columnGap: '16px' }}>
          <span>Артикул</span><span>Найменування</span><span style={{ textAlign: 'right' }}>К-сть</span>
          {hasLC ? (
            <><span style={{ textAlign: 'right' }}>Ціна до</span><span style={{ textAlign: 'center', color: '#7C3AED' }}>+LC</span><span style={{ textAlign: 'right' }}>Ціна після</span><span style={{ textAlign: 'right' }}>Сума</span></>
          ) : (
            <><span style={{ textAlign: 'right' }}>Ціна закупки</span><span style={{ textAlign: 'right' }}>Сума</span></>
          )}
        </div>
        {(lines ?? []).map((line: { sku: string; qty: number; cost_price: number; is_bonus?: boolean }, idx: number) => {
          const origPrice  = originalPriceMap.get(line.sku) ?? Number(line.cost_price ?? 0);
          const finalPrice = finalPriceMap.get(line.sku) ?? Number(line.cost_price ?? 0);
          const lcAdded    = finalPrice - origPrice;
          const costPrice  = line.is_bonus ? 0 : Number(line.cost_price || 0);
          return (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: hasLC ? '110px minmax(0,1fr) 60px 100px 80px 100px 100px' : '120px minmax(0,1fr) 70px 110px 110px', padding: '9px 16px', alignItems: 'center', borderTop: '1px solid var(--border-light)', columnGap: '16px', background: line.is_bonus ? '#FFFBEB' : undefined }}>
              <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-primary)' }}>{line.sku}</span>
              <div style={{ overflow: 'hidden', minWidth: 0 }}>
                <div style={{ fontSize: '13px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {nameMap.get(line.sku) || line.sku}
                  {line.is_bonus && (
                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#B45309', background: '#FEF3C7', padding: '1px 6px', borderRadius: '4px', flexShrink: 0 }}>🎁 Бонус</span>
                  )}
                </div>
              </div>
              <span style={{ textAlign: 'right', fontSize: '13px' }}>{line.qty} шт</span>
              {hasLC ? (
                <>
                  <span style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-secondary)' }}>{fmt(line.is_bonus ? 0 : origPrice)} ₴</span>
                  <div style={{ textAlign: 'center' }}>
                    {!line.is_bonus && lcAdded > 0.01 ? <span style={{ fontSize: '11px', fontWeight: 700, color: '#7C3AED', background: '#F5F3FF', padding: '1px 6px', borderRadius: '4px' }}>+{fmt(lcAdded)} ₴</span> : <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>—</span>}
                  </div>
                  <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(line.is_bonus ? 0 : finalPrice)} ₴</span>
                  <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 600 }}>{fmt(line.is_bonus ? 0 : line.qty * finalPrice)} ₴</span>
                </>
              ) : (
                <>
                  <span style={{ textAlign: 'right', fontSize: '13px', color: 'var(--text-secondary)' }}>{fmt(costPrice)} ₴</span>
                  <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 600 }}>{fmt(line.qty * costPrice)} ₴</span>
                </>
              )}
            </div>
          );
        })}
        <div style={{ padding: '10px 16px', borderTop: '2px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 800 }}>
          <span>Всього{hasLC ? ' (з Landed Cost)' : ''}</span>
          <span>{fmt(totalAfterLC)} ₴</span>
        </div>
      </div>

      {/* Додаткові витрати */}
      {hasLC && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid #DDD6FE', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: '13px', fontWeight: 700, color: '#7C3AED' }}>
            📦 Додаткові витрати (Landed Cost)
          </div>
          {(landedCosts ?? []).map((lc: { id: string; cost_type: string; description: string | null; amount: number; distributed: boolean }) => (
            <div key={lc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 16px', borderTop: '1px solid var(--border-light)' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{COST_TYPE_LABELS[lc.cost_type] ?? lc.cost_type}{lc.description ? ` · ${lc.description}` : ''}</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#7C3AED' }}>+{fmt(lc.amount)} ₴</span>
            </div>
          ))}
          <div style={{ padding: '10px 16px', borderTop: '2px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 800 }}>
            <span>Загальна собівартість</span>
            <span style={{ color: 'var(--text-primary)' }}>{fmt(totalAfterLC)} ₴</span>
          </div>
        </div>
      )}
      </div>{/* end left column */}

      {/* Right column: оплата (тільки для standalone ПН) */}
      {isStandalone && (
        <ReceiptPaymentPanel
          receiptId={id}
          totalCost={totalAfterLC}
          paymentHistory={paymentHistory}
          totalPaid={totalPaid}
          deferredUntil={(doc.meta as Record<string, unknown> | null)?.payment_defer_date as string | null | undefined}
        />
      )}
      </div>{/* end grid */}
    </div>
  );
}
