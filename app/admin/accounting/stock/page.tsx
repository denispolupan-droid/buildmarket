import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { Package, Warehouse, ChevronRight, AlertTriangle } from 'lucide-react';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function StockHubPage() {
  const [
    { count: supplierInStock },
    { count: supplierTotal },
    { count: ownPositions },
    { data: suppliers },
    { data: allWithMin },
  ] = await Promise.all([
    db.from('product_stock').select('*', { count: 'exact', head: true }).eq('stock_status', 'in_stock'),
    db.from('product_stock').select('*', { count: 'exact', head: true }),
    db.from('stock_balance').select('*', { count: 'exact', head: true }).gt('qty_available', 0),
    db.from('suppliers').select('id').order('name'),
    db.from('stock_balance').select('qty_total, min_reorder_qty').not('min_reorder_qty', 'is', null).gt('min_reorder_qty', 0),
  ]);

  const reorderCount = (allWithMin ?? []).filter(r => Number(r.qty_total) <= Number(r.min_reorder_qty)).length;

  return (
    <div style={{ padding: '28px 32px', maxWidth: '960px' }}>
      <style>{`
        .stock-card { transition: box-shadow 0.15s, border-color 0.15s; }
        .stock-card:hover { box-shadow: 0 4px 20px rgba(0,0,0,0.18); border-color: var(--brand-blue) !important; }
        .supplier-row { transition: border-color 0.15s, box-shadow 0.15s; }
        .supplier-row:hover { border-color: var(--brand-blue) !important; box-shadow: 0 2px 12px rgba(0,0,0,0.10); }
      `}</style>

      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          Склад
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Оберіть розділ для перегляду залишків
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {reorderCount > 0 && (
          <Link href="/admin/accounting/stock/reorder" style={{ textDecoration: 'none', gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px', background: '#FEF3C7', border: '1.5px solid #FCD34D', borderRadius: '12px', cursor: 'pointer' }}>
              <AlertTriangle size={20} color="#D97706" />
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: '#92400E' }}>
                  {reorderCount} {reorderCount === 1 ? 'позиція потребує' : reorderCount < 5 ? 'позиції потребують' : 'позицій потребують'} поповнення
                </span>
                <span style={{ fontSize: '12px', color: '#B45309', marginLeft: '8px' }}>— залишок нижче мінімального рівня</span>
              </div>
              <ChevronRight size={18} color="#D97706" />
            </div>
          </Link>
        )}
        <Link href="/admin/accounting/stock/suppliers" style={{ textDecoration: 'none' }}>
          <div className="stock-card" style={{
            background: 'var(--bg-card)', border: '1.5px solid var(--border)',
            borderRadius: '16px', padding: '28px 24px',
            display: 'flex', flexDirection: 'column', gap: '16px', cursor: 'pointer',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ padding: '10px', background: 'var(--bg-card)', borderRadius: '12px', display: 'inline-flex' }}>
                <Package size={28} color="#1E3A5F" />
              </div>
              <ChevronRight size={20} color="#94A3B8" />
            </div>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>
                Залишки постачальників
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                {supplierInStock ?? 0} в наявності · {supplierTotal ?? 0} позицій загалом
              </div>
            </div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)' }}>
              {suppliers?.length ?? 0}
              <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginLeft: '6px' }}>
                постачальників
              </span>
            </div>
          </div>
        </Link>

        <Link href="/admin/accounting/stock/own" style={{ textDecoration: 'none' }}>
          <div className="stock-card" style={{
            background: 'var(--bg-card)', border: '1.5px solid var(--border)',
            borderRadius: '16px', padding: '28px 24px',
            display: 'flex', flexDirection: 'column', gap: '16px', cursor: 'pointer',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ padding: '10px', background: 'var(--bg-card)', borderRadius: '12px', display: 'inline-flex' }}>
                <Warehouse size={28} color="#15803D" />
              </div>
              <ChevronRight size={20} color="#94A3B8" />
            </div>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>
                Власний склад
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                {ownPositions ?? 0} позицій в наявності
              </div>
            </div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)' }}>
              {ownPositions ?? 0}
              <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', marginLeft: '6px' }}>
                позицій
              </span>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}

