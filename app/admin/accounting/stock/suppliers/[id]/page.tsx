import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Package } from 'lucide-react';
import SyncButton from './SyncButton';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function SupplierStockPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supplierId = Number(id);

  const [{ data: supplier }, { data: lastSync }, { data: stock }] = await Promise.all([
    db.from('suppliers').select('id, name, email').eq('id', supplierId).single(),
    db.from('supplier_sync_log')
      .select('rows_updated, rows_unmapped, error_message, finished_at')
      .eq('supplier_id', supplierId)
      .order('finished_at', { ascending: false })
      .limit(1)
      .single(),
    db.from('supplier_stock')
      .select('sku, supplier_sku, stock_qty, stock_status, price_cost, price_unit, updated_at')
      .eq('supplier_id', supplierId)
      .order('stock_status')
      .order('stock_qty', { ascending: false }),
  ]);

  if (!supplier) notFound();

  // supplier_sku доступний прямо в рядку — додатковий join не потрібен
  const supplierSkuMap = new Map((stock ?? []).map(r => [r.sku, r.supplier_sku]));

  const stockSkus = (stock ?? []).map(s => s.sku);
  const { data: products } = stockSkus.length
    ? await db.from('products').select('sku, name, brand').in('sku', stockSkus)
    : { data: [] };
  const nameMap = new Map((products ?? []).map(p => [p.sku, p]));

  const inStock  = (stock ?? []).filter(s => s.stock_status === 'in_stock').length;
  const onOrder  = (stock ?? []).filter(s => s.stock_status === 'on_order').length;
  const outStock = (stock ?? []).filter(s => s.stock_status === 'out_of_stock').length;

  const statusStyle = (status: string) =>
    status === 'in_stock'       ? { color: '#15803D', bg: '#F0FDF4', label: 'В наявності' } :
    status === 'on_order'       ? { color: '#B45309', bg: '#FEF3C7', label: 'Під замовлення' } :
                                  { color: '#DC2626', bg: '#FEF2F2', label: 'Відсутній' };

  const col: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '140px 120px 1fr 90px 90px 120px',
  };

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1400px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        <Link href="/admin/accounting/stock/suppliers" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)', textDecoration: 'none' }}>
          <ArrowLeft size={16} />
        </Link>
        <Package size={18} color="#1E3A5F" />
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          {supplier.name}
        </h1>
      </div>

      {/* Sync row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          {lastSync?.finished_at
            ? `Остання синхронізація: ${new Date(lastSync.finished_at).toLocaleString('uk-UA')} · ${lastSync.rows_updated} оновлено`
            : 'Ще не синхронізовано'}
        </div>
        <SyncButton supplierId={supplierId} />
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'В наявності', value: inStock,  color: '#15803D', bg: '#F0FDF4' },
          { label: 'Під замовлення', value: onOrder,  color: '#B45309', bg: '#FEF3C7' },
          { label: 'Відсутній', value: outStock, color: '#DC2626', bg: '#FEF2F2' },
        ].map(s => (
          <div key={s.label} style={{ padding: '12px 20px', borderRadius: '10px', background: s.bg }}>
            <div style={{ fontSize: '22px', fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '12px', color: s.color, opacity: 0.8 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      {!stock?.length ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px',
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px' }}>
          Немає даних. Натисніть «Синхронізувати зараз» для завантаження залишків.
        </div>
      ) : (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ ...col, padding: '8px 16px', background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)',
            fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            <span>Наш артикул</span><span>Арт. постач.</span><span>Назва</span>
            <span style={{ textAlign: 'right' }}>К-сть</span>
            <span style={{ textAlign: 'right' }}>Закупка</span>
            <span style={{ textAlign: 'center' }}>Статус</span>
          </div>
          {(stock ?? []).map((row, idx) => {
            const p = nameMap.get(row.sku);
            const st = statusStyle(row.stock_status);
            return (
              <div key={row.sku} style={{
                ...col, padding: '9px 16px', alignItems: 'center',
                borderBottom: idx < (stock?.length ?? 0) - 1 ? '1px solid var(--border-light)' : 'none',
                opacity: row.stock_status === 'out_of_stock' ? 0.55 : 1,
              }}>
                <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-muted)' }}>{row.sku}</span>
                <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-muted)' }}>
                  {supplierSkuMap.get(row.sku) ?? '—'}
                </span>
                <span style={{ fontSize: '13px', color: 'var(--text-primary)', paddingRight: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ color: 'var(--text-muted)', marginRight: '4px' }}>{p?.brand}</span>{p?.name}
                </span>
                <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 600 }}>
                  {row.stock_qty > 0 ? row.stock_qty : '—'}
                </span>
                <span style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {row.price_cost ? `${row.price_cost} ₴` : '—'}
                </span>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
                    color: st.color, background: st.bg }}>{st.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
