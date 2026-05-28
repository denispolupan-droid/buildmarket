/**
 * lib/accounting/fulfillment.ts
 *
 * Роутер выполнения заказа: решает откуда отгружать каждую позицию.
 *
 * Алгоритм для каждого SKU:
 *   1. Загружаем правила из fulfillment_rules (ORDER BY priority ASC)
 *   2. Перебираем правила по приоритету
 *   3. Для физического склада → проверяем stock_balance.qty_available
 *   4. Для склада поставщика  → проверяем product_stock.stock_qty
 *   5. Первый склад с достаточным остатком → назначаем его
 *   6. Если ни одно правило не подошло → fallback на дропшип от любого поставщика
 *
 * Пример правил (настраивается в БД):
 *   priority=1, warehouse=main (physical)    → сначала наш склад
 *   priority=2, warehouse=supplier-abc (supplier) → потом поставщик A
 *   priority=3, warehouse=supplier-xyz (supplier) → потом поставщик B
 */

import { createServiceClient } from '../supabase';

export type FulfillmentSource = {
  sku:              string;
  qty:              number;
  fulfillment_type: 'own' | 'dropship';
  warehouse_id:     number;
  supplier_id:      number | null;
};

export type FulfillmentPlan = {
  items:        FulfillmentSource[];
  has_own:      boolean;   // есть хотя бы одна позиция с нашего склада
  has_dropship: boolean;   // есть хотя бы одна позиция дропшипом
  unresolved:   string[];  // SKU для которых не нашли источник (нет нигде)
};

// ── Основная функция: план выполнения заказа ──────────────────────────────────

export async function resolveOrderFulfillment(
  items: Array<{ sku: string; qty: number }>,
  opts: {
    channel_code?:   string;
    customer_type?:  string;
  } = {},
): Promise<FulfillmentPlan> {
  const db = createServiceClient();

  // 1. Загружаем правила маршрутизации (активные, по приоритету)
  //    Фильтруем на стороне приложения — правила с NULL применяются ко всем
  const { data: allRules } = await db
    .from('fulfillment_rules')
    .select(`
      id, priority, warehouse_id, sku, category_slug, channel_code, customer_type,
      warehouses:warehouse_id (warehouse_type, supplier_id, is_active)
    `)
    .eq('is_active', true)
    .order('priority', { ascending: true });

  const rules = (allRules ?? []).filter(rule => {
    if (rule.channel_code && rule.channel_code !== opts.channel_code) return false;
    if (rule.customer_type && rule.customer_type !== opts.customer_type) return false;
    return true;
  });

  if (rules.length === 0) {
    // Нет правил → всё дропшипом (текущий режим)
    return await fallbackAllDropship(items);
  }

  const skus = items.map(i => i.sku);

  // 2. Загружаем остатки по физическим складам
  const physicalWarehouseIds = [
    ...new Set(
      rules
        .filter(r => (r.warehouses as { warehouse_type?: string })?.warehouse_type === 'physical')
        .map(r => r.warehouse_id),
    ),
  ];

  const balanceMap = new Map<string, Map<number, number>>();

  if (physicalWarehouseIds.length > 0) {
    const { data: balances } = await db
      .from('stock_balance')
      .select('sku, warehouse_id, qty_available')
      .in('sku', skus)
      .in('warehouse_id', physicalWarehouseIds);

    for (const b of balances ?? []) {
      if (!balanceMap.has(b.sku)) balanceMap.set(b.sku, new Map());
      balanceMap.get(b.sku)!.set(b.warehouse_id, Number(b.qty_available));
    }
  }

  // 3. Загружаем остатки поставщиков из product_stock
  const { data: supplierStock } = await db
    .from('product_stock')
    .select('sku, stock_qty, stock_status')
    .in('sku', skus);

  const supplierStockMap = new Map(
    (supplierStock ?? []).map(s => [
      s.sku,
      { qty: Number(s.stock_qty), available: s.stock_status === 'in_stock' },
    ]),
  );

  // 4. Маппинг склад → supplier_id
  const warehouseSupplierMap = new Map<number, number | null>();
  for (const rule of rules) {
    const wh = rule.warehouses as { warehouse_type?: string; supplier_id?: number; is_active?: boolean };
    warehouseSupplierMap.set(rule.warehouse_id, wh?.supplier_id ?? null);
  }

  // 5. Для каждой позиции перебираем правила и выбираем источник
  const result: FulfillmentSource[] = [];
  const unresolved: string[] = [];

  for (const item of items) {
    let resolved = false;

    // Правила применимые к этому SKU (общие + специфичные для SKU)
    const applicableRules = rules.filter(
      r => r.sku === null || r.sku === item.sku,
    );

    for (const rule of applicableRules) {
      const wh = rule.warehouses as { warehouse_type?: string; supplier_id?: number; is_active?: boolean };
      if (!wh?.is_active) continue;

      const isPhysical = wh.warehouse_type === 'physical';

      if (isPhysical) {
        const available = balanceMap.get(item.sku)?.get(rule.warehouse_id) ?? 0;
        if (available >= item.qty) {
          result.push({
            sku:              item.sku,
            qty:              item.qty,
            fulfillment_type: 'own',
            warehouse_id:     rule.warehouse_id,
            supplier_id:      null,
          });
          resolved = true;
          break;
        }
      } else {
        // Склад поставщика: проверяем product_stock
        const stock = supplierStockMap.get(item.sku);
        if (stock?.available && stock.qty >= item.qty) {
          result.push({
            sku:              item.sku,
            qty:              item.qty,
            fulfillment_type: 'dropship',
            warehouse_id:     rule.warehouse_id,
            supplier_id:      warehouseSupplierMap.get(rule.warehouse_id) ?? null,
          });
          resolved = true;
          break;
        }
      }
    }

    if (!resolved) {
      // Нет подходящего правила — fallback дропшип
      const supplierRes = await resolveDropshipFallback(db, item.sku, item.qty);
      if (supplierRes) {
        result.push({ ...item, ...supplierRes });
      } else {
        unresolved.push(item.sku);
      }
    }
  }

  return {
    items:        result,
    has_own:      result.some(i => i.fulfillment_type === 'own'),
    has_dropship: result.some(i => i.fulfillment_type === 'dropship'),
    unresolved,
  };
}

// ── Вспомогательные ───────────────────────────────────────────────────────────

async function fallbackAllDropship(
  items: Array<{ sku: string; qty: number }>,
): Promise<FulfillmentPlan> {
  const db = createServiceClient();
  const result: FulfillmentSource[] = [];
  const unresolved: string[] = [];

  for (const item of items) {
    const res = await resolveDropshipFallback(db, item.sku, item.qty);
    if (res) result.push({ ...item, ...res });
    else unresolved.push(item.sku);
  }

  return { items: result, has_own: false, has_dropship: result.length > 0, unresolved };
}

async function resolveDropshipFallback(
  db: ReturnType<typeof createServiceClient>,
  sku: string,
  qty: number,
): Promise<Omit<FulfillmentSource, 'sku' | 'qty'> | null> {
  // Ищем поставщика: сначала supplier_sku_map, fallback — supplier_stock
  const { data: mapping } = await db
    .from('supplier_sku_map')
    .select('supplier_id')
    .eq('our_sku', sku)
    .limit(1)
    .maybeSingle();

  let supplierId: number | null = mapping?.supplier_id ?? null;

  if (!supplierId) {
    const { data: stockRow } = await db
      .from('supplier_stock')
      .select('supplier_id')
      .eq('sku', sku)
      .limit(1)
      .maybeSingle();
    supplierId = stockRow?.supplier_id ?? null;
  }

  // Находим виртуальный склад поставщика
  const { data: wh } = await db
    .from('warehouses')
    .select('id')
    .eq('warehouse_type', 'supplier')
    .eq('supplier_id', supplierId ?? -1)
    .single();

  // Fallback: основной склад если supplier warehouse не найден
  const { data: mainWh } = !wh ? await db
    .from('warehouses')
    .select('id')
    .eq('is_default', true)
    .single() : { data: null };

  const warehouseId = wh?.id ?? mainWh?.id;
  if (!warehouseId) return null;

  return {
    fulfillment_type: 'dropship',
    warehouse_id:     warehouseId,
    supplier_id:      supplierId,
  };
}
