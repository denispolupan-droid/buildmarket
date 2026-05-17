import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { ArrowLeft, Warehouse } from 'lucide-react';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function OwnStockPage() {
  const { data: physicalWarehouses } = await db
    .from('warehouses').select('id, name').eq('warehouse_type', 'physical');
  const physicalIds = (physicalWarehouses ?? []).map(w => w.id);

  const { data: ownBalance } = physicalIds.length ? await db
    .from('stock_balance')
    .select('sku, qty_total, qty_reserved, qty_available, avg_cost, warehouse_id')
    .in('warehouse_id', physicalIds)
    .gt('qty_total', 0)
    .order('qty_total', { ascending: false })
    .limit(500) : { data: [] };

  const skus = (ownBalance ?? []).map(r => r.sku);
  const { data: products } = skus.length
    ? await db.from('products').select('sku, name, brand').in('sku', skus)
    : { data: [] };
  const nameMap = new Map((products ?? []).map(p => [p.sku, p]));
  const whMap = new Map((physicalWarehouses ?? []).map(w => [w.id, w.name]));

  const col: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '140px 1fr 120px 90px 90px 90px 100px',
  };

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1400px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <Link href="/admin/accounting/stock" style={{ display: 'flex', alignItems: 'center', color: '#64748B', textDecoration: 'none' }}>
          <ArrowLeft size={16} />
        </Link>
        <Warehouse size={18} color="#15803D" />
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          Власний склад
        </h1>
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          {ownBalance?.length ?? 0} позицій
        </span>
      </div>

      {!ownBalance?.length ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px',
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px' }}>
          Власний склад порожній. Зробіть прихід товару через Документи → Прихід товару.
        </div>
      ) : (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ ...col, padding: '8px 16px', background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)',
            fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            <span>Артикул</span><span>Назва</span><span>Склад</span>
            <span style={{ textAlign: 'right' }}>Всього</span>
            <span style={{ textAlign: 'right' }}>Резерв</span>
            <span style={{ textAlign: 'right' }}>Доступно</span>
            <span style={{ textAlign: 'right' }}>Собівартість</span>
          </div>
          {(ownBalance ?? []).map((row, idx) => {
            const p = nameMap.get(row.sku);
            return (
              <div key={`${row.sku}-${row.warehouse_id}`} style={{
                ...col, padding: '10px 16px', alignItems: 'center',
                borderBottom: idx < (ownBalance?.length ?? 0) - 1 ? '1px solid var(--border-light)' : 'none',
              }}>
                <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-muted)' }}>{row.sku}</span>
                <span style={{ fontSize: '13px', color: 'var(--text-primary)', paddingRight: '16px' }}>
                  <span style={{ color: 'var(--text-muted)', marginRight: '4px' }}>{p?.brand}</span>{p?.name}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{whMap.get(row.warehouse_id) ?? '—'}</span>
                <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 600 }}>{row.qty_total}</span>
                <span style={{ textAlign: 'right', fontSize: '13px', color: '#B45309' }}>{row.qty_reserved > 0 ? row.qty_reserved : '—'}</span>
                <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 700,
                  color: row.qty_available > 0 ? '#15803D' : '#DC2626' }}>{row.qty_available}</span>
                <span style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {row.avg_cost > 0 ? `${Number(row.avg_cost).toFixed(2)} ₴` : '—'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
