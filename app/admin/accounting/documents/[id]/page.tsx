import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, X } from 'lucide-react';
import ReturnButton from '../../../procurement/[id]/ReturnButton';
import DocChain from '../../../procurement/[id]/DocChain';

export const dynamic = 'force-dynamic';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const DOC_TYPE_LABELS: Record<string, string> = {
  purchase_order: 'Замовлення постачальнику',
  receipt:        'Прихід товару',
  stock_in:       'Прихід товару',
  sale:           'Продаж',
  return_in:      'Повернення від покупця',
  return_out:     'Повернення постачальнику',
  write_off:      'Списання',
  transfer:       'Переміщення',
  inventory:      'Інвентаризація',
};
const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  draft:     { label: 'Чернетка',  color: '#64748B', bg: '#F8FAFC' },
  confirmed: { label: 'Проведено', color: '#15803D', bg: '#F0FDF4' },
  cancelled: { label: 'Скасовано', color: '#DC2626', bg: '#FEF2F2' },
};

function fmt(n: number) { return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') redirect('/');

  const { id } = await params;

  const [{ data: doc }, { data: lines }] = await Promise.all([
    db.from('acc_documents')
      .select('*, supplier:supplier_id(name), warehouse:warehouse_id(name)')
      .eq('id', id).single(),
    db.from('acc_document_lines')
      .select('*').eq('document_id', id).order('sort_order'),
  ]);

  if (!doc) notFound();

  const skus = (lines ?? []).map((l: { sku: string }) => l.sku).filter(Boolean);
  const { data: products } = skus.length
    ? await db.from('products').select('sku, name, brand').in('sku', skus)
    : { data: [] };
  const nameMap = new Map((products ?? []).map(p => [p.sku, `${p.brand} ${p.name}`.trim()]));

  // Landed costs якщо є
  const { data: landedCosts } = await db.from('landed_cost_lines').select('*').eq('document_id', id);

  // FIFO партії (містять ФІНАЛЬНУ собівартість після landed cost)
  const { data: batches } = await db.from('stock_batches').select('sku, initial_qty, cost_price').eq('document_id', id);

  // Оригінальні ціни з батьківського PO (до розподілу landed cost)
  const { data: poLines } = doc.parent_doc_id
    ? await db.from('acc_document_lines').select('sku, cost_price').eq('document_id', doc.parent_doc_id)
    : { data: [] };
  const originalPriceMap = new Map((poLines ?? []).map(l => [l.sku, Number(l.cost_price ?? 0)]));

  // Дочірні документи — приходні ордери, які базуються на цьому PO
  const { data: childDocs } = doc.doc_type === 'purchase_order'
    ? await db.from('acc_documents')
        .select('id, doc_number, doc_type, status')
        .eq('parent_doc_id', id)
        .in('doc_type', ['receipt', 'stock_in'])
        .neq('status', 'cancelled')
    : { data: [] };

  // Фінальні ціни з FIFO партій
  const finalPriceMap = new Map((batches ?? []).map(b => [b.sku, Number(b.cost_price)]));

  const hasLandedCost = (landedCosts ?? []).length > 0;
  const totalLandedCost = (landedCosts ?? []).reduce((s: number, l: { amount: number }) => s + Number(l.amount), 0);

  const st = STATUS_LABELS[doc.status] ?? STATUS_LABELS.draft;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supplierName = (doc.supplier as any)?.name ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const warehouseName = (doc.warehouse as any)?.name ?? null;

  // totalCost — сума рядків БЕЗ landed cost (оригінальні ціни з PO або з рядків якщо немає LC)
  const totalCost = (lines ?? []).reduce((s: number, l: { sku: string; qty: number; cost_price: number }) => {
    const origPrice = hasLandedCost ? (originalPriceMap.get(l.sku) ?? Number(l.cost_price ?? 0)) : Number(l.cost_price ?? 0);
    return s + (l.qty * origPrice);
  }, 0);
  // totalAfterLC — фінальна собівартість з FIFO-партій (включає розподілений LC)
  const totalAfterLC = hasLandedCost
    ? (batches ?? []).reduce((s: number, b: { initial_qty: number; cost_price: number }) => s + b.initial_qty * b.cost_price, 0)
    : totalCost;

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1000px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <Link href="/admin/accounting/documents" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)', textDecoration: 'none' }}>
          <ArrowLeft size={16} />
        </Link>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{doc.doc_number}</h1>
            <span style={{ padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, color: st.color, background: st.bg }}>{st.label}</span>
            {doc.status === 'confirmed' && ['receipt','stock_in'].includes(doc.doc_type) && (
              <ReturnButton
                receiptId={id}
                lines={(lines ?? []).map((l: { sku: string; qty: number; cost_price: number }) => ({
                  sku: l.sku, qty: Number(l.qty), cost_price: Number(l.cost_price ?? 0),
                  name: nameMap.get(l.sku),
                }))}
              />
            )}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '3px' }}>
            {DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}
            {supplierName && ` · ${supplierName}`}
            {warehouseName && ` · ${warehouseName}`}
            {' · '}{new Date(doc.doc_date).toLocaleDateString('uk-UA')}
          </div>
        </div>
        {doc.parent_doc_id && (
          <Link
            href={
              ['receipt','stock_in'].includes(doc.doc_type)
                ? `/admin/procurement/${doc.parent_doc_id}`
                : `/admin/accounting/documents/${doc.parent_doc_id}`
            }
            style={{ fontSize: '12px', color: '#1E3A5F', textDecoration: 'none', background: '#EFF4FF', padding: '4px 12px', borderRadius: '6px', fontWeight: 600 }}>
            ↑ {['receipt','stock_in'].includes(doc.doc_type) ? 'Замовлення' : 'Підстава'}
          </Link>
        )}
        {(childDocs ?? []).map((child: { id: string; doc_number: string; doc_type: string; status: string }) => (
          <Link key={child.id} href={`/admin/accounting/documents/${child.id}`}
            style={{ fontSize: '12px', color: '#15803D', textDecoration: 'none', background: '#F0FDF4', padding: '4px 12px', borderRadius: '6px', fontWeight: 600, border: '1px solid #BBF7D0' }}>
            ↓ {child.doc_number}
          </Link>
        ))}
        {/* DocChain: для PO — свій id, для receipt — parent_doc_id */}
        {(doc.doc_type === 'purchase_order' || (doc.parent_doc_id && ['receipt','stock_in'].includes(doc.doc_type))) && (
          <DocChain poId={doc.doc_type === 'purchase_order' ? id : doc.parent_doc_id!} />
        )}
        <Link href="/admin/accounting/documents" title="Закрити"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: '8px', border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)', textDecoration: 'none', flexShrink: 0 }}>
          <X size={15} />
        </Link>
      </div>

      {doc.notes && (
        <div style={{ padding: '10px 14px', background: 'var(--bg-soft)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          {doc.notes}
        </div>
      )}

      {/* Lines table */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', marginBottom: '16px' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Товари</span>
          {hasLandedCost && <span style={{ fontSize: '11px', fontWeight: 600, color: '#7C3AED', background: '#F5F3FF', padding: '2px 10px', borderRadius: '20px' }}>З урахуванням Landed Cost</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: hasLandedCost ? '110px minmax(0,1fr) 60px 100px 80px 100px 100px' : '120px minmax(0,1fr) 70px 110px 110px', padding: '7px 16px', background: 'var(--bg-soft)', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', columnGap: '16px' }}>
          <span>Артикул</span><span>Найменування</span><span style={{ textAlign: 'right' }}>К-сть</span>
          {hasLandedCost ? (
            <>
              <span style={{ textAlign: 'right' }}>Ціна до</span>
              <span style={{ textAlign: 'center', color: '#7C3AED' }}>+LC</span>
              <span style={{ textAlign: 'right' }}>Ціна після</span>
              <span style={{ textAlign: 'right' }}>Сума</span>
            </>
          ) : (
            <>
              <span style={{ textAlign: 'right' }}>Ціна</span>
              <span style={{ textAlign: 'right' }}>Сума</span>
            </>
          )}
        </div>
        {(lines ?? []).map((line: { sku: string; qty: number; price: number; cost_price: number; sort_order: number }, idx: number) => {
          const originalPrice = originalPriceMap.get(line.sku) ?? Number(line.cost_price ?? line.price ?? 0);
          const finalPrice    = finalPriceMap.get(line.sku) ?? Number(line.cost_price ?? line.price ?? 0);
          const lcAdded       = finalPrice - originalPrice;
          return (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: hasLandedCost ? '110px minmax(0,1fr) 60px 100px 80px 100px 100px' : '120px minmax(0,1fr) 70px 110px 110px', padding: '9px 16px', alignItems: 'center', borderTop: '1px solid var(--border-light)', columnGap: '16px' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-muted)' }}>{line.sku}</span>
              <div style={{ overflow: 'hidden', minWidth: 0 }}>
                <div style={{ fontSize: '13px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {nameMap.get(line.sku) || line.sku}
                </div>
              </div>
              <span style={{ textAlign: 'right', fontSize: '13px' }}>{line.qty} шт</span>
              {hasLandedCost ? (
                <>
                  <span style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-secondary)' }}>{fmt(originalPrice)} ₴</span>
                  <div style={{ textAlign: 'center' }}>
                    {lcAdded > 0
                      ? <span style={{ fontSize: '11px', fontWeight: 700, color: '#7C3AED', background: '#F5F3FF', padding: '1px 6px', borderRadius: '4px' }}>+{fmt(lcAdded)} ₴</span>
                      : <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>—</span>}
                  </div>
                  <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#1E3A5F' }}>{fmt(finalPrice)} ₴</span>
                  <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 600 }}>{fmt(line.qty * finalPrice)} ₴</span>
                </>
              ) : (
                <>
                  <span style={{ textAlign: 'right', fontSize: '13px', color: 'var(--text-secondary)' }}>{fmt(Number(line.cost_price || line.price || 0))} ₴</span>
                  <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 600 }}>{fmt(line.qty * Number(line.cost_price || line.price || 0))} ₴</span>
                </>
              )}
            </div>
          );
        })}
        <div style={{ padding: '10px 16px', borderTop: '2px solid var(--border)', display: 'grid', gridTemplateColumns: hasLandedCost ? '110px minmax(0,1fr) 60px 100px 80px 100px 100px' : '1fr 110px', alignItems: 'center', columnGap: '16px', fontSize: '13px', fontWeight: 800 }}>
          {hasLandedCost ? (
            <>
              <span style={{ gridColumn: '1/4', color: 'var(--text-primary)' }}>Всього</span>
              <span style={{ textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 400, fontSize: '12px' }}>{fmt(totalCost)} ₴</span>
              <span style={{ textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#7C3AED' }}>+{fmt(totalLandedCost)} ₴</span>
              <span style={{ textAlign: 'right', color: '#1E3A5F' }}>{fmt(totalAfterLC)} ₴</span>
              <span style={{ textAlign: 'right' }}>{fmt(totalAfterLC)} ₴</span>
            </>
          ) : (
            <>
              <span>Всього</span>
              <span style={{ textAlign: 'right' }}>{fmt(totalCost)} ₴</span>
            </>
          )}
        </div>
      </div>

      {/* Landed costs */}
      {(landedCosts ?? []).length > 0 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', marginBottom: '16px' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Додаткові витрати (Landed Cost)
          </div>
          {(landedCosts ?? []).map((lc: { id: string; cost_type: string; description: string | null; amount: number; distributed: boolean }) => (
            <div key={lc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 16px', borderTop: '1px solid var(--border-light)' }}>
              <div>
                <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{lc.description ?? lc.cost_type}</span>
                {lc.distributed && <span style={{ marginLeft: '8px', fontSize: '11px', color: '#15803D', fontWeight: 600 }}>✓ Розподілено</span>}
              </div>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#7C3AED' }}>+{fmt(lc.amount)} ₴</span>
            </div>
          ))}
          <div style={{ padding: '10px 16px', borderTop: '2px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 800 }}>
            <span>Разом з Landed Cost</span>
            <span>{fmt(totalAfterLC)} ₴</span>
          </div>
        </div>
      )}

    </div>
  );
}
