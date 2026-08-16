import { createClient } from '@supabase/supabase-js';
import OwnStockTable from './OwnStockTable';
import StockDocButtons from './StockDocButtons';
import SectionBar, { plural } from '../SectionBar';

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
  const n = ownBalance?.length ?? 0;

  return (
    <div style={{ maxWidth: '1400px' }}>
      <SectionBar count={`${n} ${plural(n, 'позиція', 'позиції', 'позицій')} на складі`}>
        <StockDocButtons />
      </SectionBar>

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
