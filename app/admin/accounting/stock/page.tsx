import { createClient } from '@supabase/supabase-js';
import { Package, TrendingUp } from 'lucide-react';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function StockPage() {
  // Синхронізовані залишки від постачальників (основне джерело при дропшипі)
  const { data: supplierStock } = await db
    .from('product_stock')
    .select('sku, price_cost, price_unit, price_drop, stock_qty, stock_status, updated_at')
    .order('stock_qty', { ascending: false })
    .limit(500);

  // Назви товарів окремим запитом (уникаємо проблемного join через sku)
  const skus = (supplierStock ?? []).map(s => s.sku);
  const { data: productNames } = skus.length
    ? await db.from('products').select('sku, name, brand').in('sku', skus)
    : { data: [] };

  const nameMap = new Map((productNames ?? []).map(p => [p.sku, p]));

  // Власні залишки (поки порожні якщо не було приходів на власний склад)
  const { data: physicalWarehouses } = await db
    .from('warehouses').select('id').eq('warehouse_type', 'physical');
  const physicalIds = (physicalWarehouses ?? []).map(w => w.id);

  const { data: ownBalance } = physicalIds.length ? await db
    .from('stock_balance')
    .select('sku, qty_total, qty_reserved, qty_available, avg_cost, updated_at, warehouse_id')
    .in('warehouse_id', physicalIds)
    .gt('qty_total', 0)
    .order('qty_total', { ascending: false })
    .limit(200) : { data: [] };

  const totalInStock = supplierStock?.filter(s => s.stock_status === 'in_stock').length ?? 0;
  const totalOut     = supplierStock?.filter(s => s.stock_status !== 'in_stock').length ?? 0;
  const ownCount     = ownBalance?.length ?? 0;

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1400px' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          Залишки
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Синхронізовані залишки постачальників + власний склад
        </p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '28px' }}>
        {[
          { label: 'В наявності (постачальник)', value: totalInStock, color: '#15803D', bg: '#F0FDF4' },
          { label: 'Відсутні / під замовлення',  value: totalOut,     color: '#B45309', bg: '#FEF3C7' },
          { label: 'На власному складі (позиції)', value: ownCount,   color: '#1E3A5F', bg: '#EFF4FF' },
        ].map(card => (
          <div key={card.label} style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px',
          }}>
            <div style={{ fontSize: '28px', fontWeight: 800, color: card.color }}>{card.value}</div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>{card.label}</div>
          </div>
        ))}
      </div>

      {/* Own balance (from accounting) */}
      {ownCount > 0 && (
        <>
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp size={16} /> Власний склад (облік)
          </h2>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', marginBottom: '28px' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: 'auto 1fr 100px 100px 100px 100px',
              padding: '8px 16px', background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)',
              fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase',
            }}>
              <span style={{ width: '120px' }}>Артикул</span><span>Назва</span>
              <span style={{ textAlign: 'right' }}>Всього</span><span style={{ textAlign: 'right' }}>Резерв</span>
              <span style={{ textAlign: 'right' }}>Доступно</span><span style={{ textAlign: 'right' }}>Собів.</span>
            </div>
            {(ownBalance ?? []).map((row, idx) => (
              <div key={`${row.sku}-${(row as any).warehouse_id}`} style={{
                display: 'grid', gridTemplateColumns: 'auto 1fr 100px 100px 100px 100px',
                padding: '10px 16px', alignItems: 'center',
                borderBottom: idx < (ownBalance?.length ?? 0) - 1 ? '1px solid var(--border-light)' : 'none',
              }}>
                <span style={{ width: '120px', fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-muted)' }}>{row.sku}</span>
                <div>
                  <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                    {nameMap.get(row.sku)?.brand} {nameMap.get(row.sku)?.name}
                  </div>
                </div>
                <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{row.qty_total}</span>
                <span style={{ textAlign: 'right', fontSize: '13px', color: '#B45309' }}>{row.qty_reserved > 0 ? row.qty_reserved : '—'}</span>
                <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 700, color: row.qty_available > 0 ? '#15803D' : '#DC2626' }}>{row.qty_available}</span>
                <span style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {row.avg_cost > 0 ? `${Number(row.avg_cost).toFixed(2)} ₴` : '—'}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Supplier stock */}
      <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Package size={16} /> Залишки постачальників (синхронізація)
      </h2>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'auto 1fr 100px 90px 90px 90px 130px',
          padding: '8px 16px', background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)',
          fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase',
        }}>
          <span style={{ width: '120px' }}>Артикул</span><span>Назва</span>
          <span style={{ textAlign: 'right' }}>К-сть</span>
          <span style={{ textAlign: 'right' }}>Закупка</span>
          <span style={{ textAlign: 'right' }}>Роздріб</span>
          <span style={{ textAlign: 'right' }}>Дроп</span>
          <span style={{ textAlign: 'center' }}>Статус</span>
        </div>

        {(supplierStock ?? []).slice(0, 200).map((row, idx) => {
          const product = nameMap.get(row.sku);
          const statusColor = row.stock_status === 'in_stock' ? { color: '#15803D', bg: '#F0FDF4', label: 'В наявності' }
            : row.stock_status === 'on_order' ? { color: '#B45309', bg: '#FEF3C7', label: 'Під замовлення' }
            : { color: '#DC2626', bg: '#FEF2F2', label: 'Відсутній' };

          return (
            <div key={row.sku} style={{
              display: 'grid', gridTemplateColumns: 'auto 1fr 100px 90px 90px 90px 130px',
              padding: '9px 16px', alignItems: 'center',
              borderBottom: idx < (supplierStock?.length ?? 0) - 1 ? '1px solid var(--border-light)' : 'none',
              opacity: row.stock_status === 'out_of_stock' ? 0.55 : 1,
            }}>
              <span style={{ width: '120px', fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-muted)' }}>{row.sku}</span>
              <div>
                <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                  <span style={{ color: 'var(--text-muted)', marginRight: '4px' }}>{product?.brand}</span>
                  {product?.name}
                </span>
              </div>
              <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {row.stock_qty > 0 ? row.stock_qty : '—'}
              </span>
              <span style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-secondary)' }}>
                {row.price_cost ? `${row.price_cost} ₴` : '—'}
              </span>
              <span style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-secondary)' }}>
                {row.price_unit ? `${row.price_unit} ₴` : '—'}
              </span>
              <span style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-secondary)' }}>
                {row.price_drop ? `${row.price_drop} ₴` : '—'}
              </span>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <span style={{
                  padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
                  color: statusColor.color, background: statusColor.bg,
                }}>
                  {statusColor.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
