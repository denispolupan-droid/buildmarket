/**
 * lib/accounting/dropship.ts
 *
 * Логика дропшипинга: заказы выполняются со складов поставщиков.
 *
 * Поток:
 *   1. Синк поставщика → product_stock (цены, остатки) — уже работает
 *   2. Клиент заказывает → orders — уже работает
 *   3. getOrderFulfillmentInfo() → менеджер видит: от кого, по какой цене, маржа
 *   4. Менеджер связывается с поставщиком вручную (или через будущий API)
 *   5. Поставщик отгружает → менеджер ставит статус shipped
 *   6. recordDropshipSale() → фиксируем выручку и себестоимость в учёте
 *
 * Важно: физических движений по нашему складу НЕТ.
 * Все строки документа имеют fulfillment_type = 'dropship'.
 */

import { createServiceClient } from '../supabase';
import { recordShipment, recordCOGS } from './money';
import { createDocument, confirmDocument } from './documents';
import { resolveOrderFulfillment } from './fulfillment';
import type { OrderItem } from '../../types';

// ── Информация о выполнении заказа ────────────────────────────────────────────

export type FulfillmentItemInfo = {
  sku:          string;
  name:         string;
  qty:          number;
  sale_price:   number;
  cost_price:   number;        // цена поставщика
  supplier_id:  number | null;
  supplier_name: string | null;
  supplier_sku: string | null;
  revenue:      number;        // qty * sale_price
  cost:         number;        // qty * cost_price
  margin:       number;        // revenue - cost
  margin_pct:   number;        // margin / revenue * 100
};

export type FulfillmentSupplierGroup = {
  supplier_id:   number | null;
  supplier_name: string | null;
  items:         FulfillmentItemInfo[];
  total_revenue: number;
  total_cost:    number;
  total_margin:  number;
};

export type OrderFulfillmentInfo = {
  by_supplier:   FulfillmentSupplierGroup[];
  total_revenue: number;
  total_cost:    number;
  total_margin:  number;
  margin_pct:    number;
};

export async function getOrderFulfillmentInfo(
  orderItems: OrderItem[],
): Promise<OrderFulfillmentInfo> {
  const db = createServiceClient();
  const skus = orderItems.map(i => i.sku);

  // Загружаем себестоимость и данные поставщика для каждого SKU
  const { data: stockRows } = await db
    .from('product_stock')
    .select('sku, price_cost, supplier_sku')
    .in('sku', skus);

  const { data: skuMapRows } = await db
    .from('supplier_sku_map')
    .select('our_sku, supplier_id, supplier_sku')
    .in('our_sku', skus);

  const { data: supplierRows } = await db
    .from('suppliers')
    .select('id, name');

  // Fallback: match by supplier_sku value from product_stock
  const supplierSkusFromStock = (stockRows ?? []).map(r => r.supplier_sku).filter(Boolean);
  const { data: fallbackMaps } = supplierSkusFromStock.length
    ? await db.from('supplier_sku_map')
        .select('supplier_sku, supplier_id')
        .in('supplier_sku', supplierSkusFromStock)
    : { data: [] };
  const fallbackBySupplierSku = new Map(
    (fallbackMaps ?? []).map(r => [r.supplier_sku, r.supplier_id]),
  );

  // Индексы для быстрого поиска
  const stockMap = new Map(
    (stockRows ?? []).map(r => [r.sku, r]),
  );
  const skuMapByOurSku = new Map(
    (skuMapRows ?? []).map(r => [r.our_sku, r]),
  );
  const supplierNameMap = new Map(
    (supplierRows ?? []).map(s => [s.id, s.name]),
  );

  // Строим информацию по каждой позиции
  const itemInfos: FulfillmentItemInfo[] = orderItems.map(item => {
    const stock      = stockMap.get(item.sku);
    const skuMapping = skuMapByOurSku.get(item.sku);

    const costPrice   = stock?.price_cost ?? 0;
    const supplierSku = skuMapping?.supplier_sku ?? stock?.supplier_sku ?? null;
    const supplierId  = skuMapping?.supplier_id
      ?? (supplierSku ? (fallbackBySupplierSku.get(supplierSku) ?? null) : null)
      // Last resort: if only one supplier exists and product has a supplier_sku, use it
      ?? (supplierSku && (supplierRows ?? []).length === 1 ? (supplierRows![0].id) : null);
    const supplierName = supplierId ? (supplierNameMap.get(supplierId) ?? null) : null;
    const revenue      = item.qty * item.price;
    const cost         = item.qty * costPrice;
    const margin       = revenue - cost;

    return {
      sku:           item.sku,
      name:          item.name,
      qty:           item.qty,
      sale_price:    item.price,
      cost_price:    costPrice,
      supplier_id:   supplierId,
      supplier_name: supplierName,
      supplier_sku:  supplierSku,
      revenue,
      cost,
      margin,
      margin_pct: revenue > 0 ? Math.round(margin / revenue * 1000) / 10 : 0,
    };
  });

  // Группируем по поставщику
  const supplierGroups = new Map<string, FulfillmentSupplierGroup>();

  for (const info of itemInfos) {
    const key = String(info.supplier_id ?? 'unknown');
    if (!supplierGroups.has(key)) {
      supplierGroups.set(key, {
        supplier_id:   info.supplier_id,
        supplier_name: info.supplier_name,
        items:         [],
        total_revenue: 0,
        total_cost:    0,
        total_margin:  0,
      });
    }
    const group = supplierGroups.get(key)!;
    group.items.push(info);
    group.total_revenue += info.revenue;
    group.total_cost    += info.cost;
    group.total_margin  += info.margin;
  }

  const bySupplier = [...supplierGroups.values()];
  const totalRevenue = bySupplier.reduce((s, g) => s + g.total_revenue, 0);
  const totalCost    = bySupplier.reduce((s, g) => s + g.total_cost, 0);
  const totalMargin  = totalRevenue - totalCost;

  return {
    by_supplier:   bySupplier,
    total_revenue: totalRevenue,
    total_cost:    totalCost,
    total_margin:  totalMargin,
    margin_pct:    totalRevenue > 0 ? Math.round(totalMargin / totalRevenue * 1000) / 10 : 0,
  };
}

// ── Фиксация продажи в учёте (при отгрузке) ───────────────────────────────────

export type RecordDropshipSaleInput = {
  order_id:      string;
  order_number:  number;
  order_items:   OrderItem[];
  channel_code?: string;
  confirmed_by?: string;
  customer_id?:  string;
  contract_id?:  string;
  business_date?: string;
};

export async function recordDropshipSale(
  input: RecordDropshipSaleInput,
): Promise<string> {
  const db = createServiceClient();

  // Получаем дефолтный склад (физический — просто для обязательного поля)
  const { data: warehouse } = await db
    .from('warehouses')
    .select('id')
    .eq('is_default', true)
    .single();

  if (!warehouse) throw new Error('Default warehouse not found');

  const skus = input.order_items.map(i => i.sku);

  // Берём себестоимость из product_stock
  const { data: stockRows } = await db
    .from('product_stock')
    .select('sku, price_cost')
    .in('sku', skus);

  const costMap = new Map(
    (stockRows ?? []).map(r => [r.sku, r.price_cost ?? 0]),
  );

  // Получаем поставщика для каждого SKU (для привязки строк)
  const { data: skuMapRows } = await db
    .from('supplier_sku_map')
    .select('our_sku, supplier_id')
    .in('our_sku', skus);

  const supplierMap = new Map(
    (skuMapRows ?? []).map(r => [r.our_sku, r.supplier_id]),
  );

  // Роутер: определяем источник отгрузки per-item (свой склад или поставщик)
  const plan = await resolveOrderFulfillment(
    input.order_items.map(i => ({ sku: i.sku, qty: i.qty })),
    { channel_code: input.channel_code ?? 'website' },
  );

  // Создаём документ продажи
  const doc = await createDocument({
    doc_type:     'sale',
    warehouse_id: warehouse.id,
    order_id:     input.order_id,
    channel_code: input.channel_code ?? 'website',
    notes:        `Заказ #${input.order_number}`,
    created_by:   input.confirmed_by ?? 'system',
    lines: input.order_items.map(item => {
      const source = plan.items.find(s => s.sku === item.sku);
      return {
        sku:              item.sku,
        qty:              item.qty,
        price:            item.price,
        cost_price:       costMap.get(item.sku) ?? 0,
        fulfillment_type: source?.fulfillment_type ?? 'dropship',
        warehouse_id:     source?.warehouse_id,
        supplier_id:      source?.supplier_id ?? undefined,
      };
    }),
  });

  // Проводим документ
  await confirmDocument(doc.id, input.confirmed_by ?? 'system');

  // Записуємо в грошовий леджер (I5: виручка і COGS разом)
  const totalRevenue = input.order_items.reduce((s, i) => s + i.qty * i.price, 0);
  const totalCOGS    = input.order_items.reduce((s, i) => s + i.qty * (costMap.get(i.sku) ?? 0), 0);

  if (totalRevenue > 0 && input.customer_id) {
    await recordShipment({
      customerId:     input.customer_id,
      contractId:     input.contract_id,
      orderId:        input.order_id,
      docId:          doc.id,
      amount:         totalRevenue,
      businessDate:   input.business_date,
      createdBy:      input.confirmed_by,
      idempotencyKey: `shipment:${input.order_id}`,
    });
  }

  if (totalCOGS > 0) {
    await recordCOGS({
      amount:         totalCOGS,
      docId:          doc.id,
      orderId:        input.order_id,
      businessDate:   input.business_date,
      createdBy:      input.confirmed_by,
      idempotencyKey: `cogs:${input.order_id}`,
    });
  }

  return doc.id;
}
