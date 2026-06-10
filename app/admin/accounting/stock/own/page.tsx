import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { ArrowLeft, Warehouse } from 'lucide-react';
import OwnStockTable from './OwnStockTable';
import StockDocButtons from './StockDocButtons';

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
    .select('sku, qty_total, qty_reserved, qty_available, avg_cost, min_reorder_qty, warehouse_id')
    .in('warehouse_id', physicalIds)
    .gt('qty_total', 0)
    .order('qty_total', { ascending: false })
    .limit(500) : { data: [] };

  const skus = (ownBalance ?? []).map(r => r.sku);
  const { data: products } = skus.length
    ? await db.from('products').select('sku, name, brand').in('sku', skus)
    : { data: [] };

  const { data: allProducts } = await db
    .from('products')
    .select('sku, name, brand')
    .eq('is_active', true)
    .order('brand', { ascending: true })
    .limit(2000);

  const nameMap: Record<string, { brand: string; name: string }> = {};
  for (const p of products ?? []) nameMap[p.sku] = { brand: p.brand ?? '', name: p.name ?? '' };

  const whMap: Record<number, string> = {};
  for (const w of physicalWarehouses ?? []) whMap[w.id] = w.name;

  const defaultWarehouseId = physicalIds[0] ?? 0;

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1400px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <Link href="/admin/accounting/stock" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)', textDecoration: 'none' }}>
          <ArrowLeft size={16} />
        </Link>
        <Warehouse size={18} color="#15803D" />
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          Власний склад
        </h1>
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          {ownBalance?.length ?? 0} позицій
        </span>
        <div style={{ marginLeft: 'auto' }}>
          <StockDocButtons />
        </div>
      </div>

      {!ownBalance?.length ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px',
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px' }}>
          Власний склад порожній. Зробіть прихід товару через Документи → Прихід товару.
        </div>
      ) : (
        <OwnStockTable
          rows={ownBalance as { sku: string; qty_total: number; qty_reserved: number; qty_available: number; avg_cost: number; min_reorder_qty: number | null; warehouse_id: number }[]}
          nameMap={nameMap}
          whMap={whMap}
          allProducts={(allProducts ?? []) as { sku: string; name: string; brand: string }[]}
          defaultWarehouseId={defaultWarehouseId}
        />
      )}
    </div>
  );
}
