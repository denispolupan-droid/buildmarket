import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, X } from 'lucide-react';
import DocChain from '../../[id]/DocChain';
import PrintButton from '../../../components/PrintButton';
import ReceiptActionsMenu from '../../[id]/ReceiptActionsMenu';

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
  if (!user || user.user_metadata?.role !== 'admin') redirect('/');

  const { id } = await params;

  const [{ data: doc }, { data: lines }] = await Promise.all([
    db.from('acc_documents')
      .select('*, supplier:supplier_id(name), warehouse:warehouse_id(name)')
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

  const { data: landedCosts } = await db.from('landed_cost_lines').select('*').eq('document_id', id);
  const { data: batches }     = await db.from('stock_batches').select('sku, initial_qty, cost_price').eq('document_id', id);
  const { data: poLines }     = doc.parent_doc_id
    ? await db.from('acc_document_lines').select('sku, cost_price').eq('document_id', doc.parent_doc_id)
    : { data: [] };

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

  const supplierName = (doc.supplier as { name?: string } | null)?.name ?? null;
  const warehouseName= (doc.warehouse as { name?: string } | null)?.name ?? null;

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
        <ReceiptActionsMenu
          receiptId={id}
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

      {doc.notes && (
        <div style={{ padding: '10px 14px', background: 'var(--bg-soft)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          {doc.notes}
        </div>
      )}

      {/* Товари */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', marginBottom: '16px' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Товари</span>
          {hasLC && <span style={{ fontSize: '11px', fontWeight: 600, color: '#7C3AED', background: '#F5F3FF', padding: '2px 10px', borderRadius: '20px' }}>З урахуванням Landed Cost</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: hasLC ? '110px minmax(0,1fr) 60px 100px 80px 100px 100px' : '120px minmax(0,1fr) 70px 110px 110px', padding: '7px 16px', background: 'var(--bg-soft)', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', columnGap: '16px' }}>
          <span>Артикул</span><span>Найменування</span><span style={{ textAlign: 'right' }}>К-сть</span>
          {hasLC ? (<><span style={{ textAlign: 'right' }}>Ціна до</span><span style={{ textAlign: 'center', color: '#7C3AED' }}>+LC</span><span style={{ textAlign: 'right' }}>Ціна після</span><span style={{ textAlign: 'right' }}>Сума</span></>) : (<><span style={{ textAlign: 'right' }}>Ціна</span><span style={{ textAlign: 'right' }}>Сума</span></>)}
        </div>
        {(lines ?? []).map((line: { sku: string; qty: number; cost_price: number }, idx: number) => {
          const origPrice  = originalPriceMap.get(line.sku) ?? Number(line.cost_price ?? 0);
          const finalPrice = finalPriceMap.get(line.sku) ?? Number(line.cost_price ?? 0);
          const lcAdded    = finalPrice - origPrice;
          return (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: hasLC ? '110px minmax(0,1fr) 60px 100px 80px 100px 100px' : '120px minmax(0,1fr) 70px 110px 110px', padding: '9px 16px', alignItems: 'center', borderTop: '1px solid var(--border-light)', columnGap: '16px' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-primary)' }}>{line.sku}</span>
              <div style={{ overflow: 'hidden', minWidth: 0 }}>
                <div style={{ fontSize: '13px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nameMap.get(line.sku) || line.sku}</div>
              </div>
              <span style={{ textAlign: 'right', fontSize: '13px' }}>{line.qty} шт</span>
              {hasLC ? (
                <>
                  <span style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-secondary)' }}>{fmt(origPrice)} ₴</span>
                  <div style={{ textAlign: 'center' }}>
                    {lcAdded > 0.01 ? <span style={{ fontSize: '11px', fontWeight: 700, color: '#7C3AED', background: '#F5F3FF', padding: '1px 6px', borderRadius: '4px' }}>+{fmt(lcAdded)} ₴</span> : <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>—</span>}
                  </div>
                  <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(finalPrice)} ₴</span>
                  <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 600 }}>{fmt(line.qty * finalPrice)} ₴</span>
                </>
              ) : (
                <>
                  <span style={{ textAlign: 'right', fontSize: '13px', color: 'var(--text-secondary)' }}>{fmt(Number(line.cost_price || 0))} ₴</span>
                  <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 600 }}>{fmt(line.qty * Number(line.cost_price || 0))} ₴</span>
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
    </div>
  );
}
