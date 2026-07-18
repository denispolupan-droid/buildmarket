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
import { recordCOGS, recordTxn, type AccountType } from './money';
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

  // Незалежні запити виконуємо паралельно (раніше — 4 послідовні round-trip).
  const [
    { data: stockRows },
    { data: skuMapRows },
    { data: supplierRows },
    { data: supplierStockRows },
  ] = await Promise.all([
    db.from('product_stock').select('sku, price_cost, supplier_sku').in('sku', skus),
    db.from('supplier_sku_map').select('our_sku, supplier_id, supplier_sku').in('our_sku', skus),
    db.from('suppliers').select('id, name'),
    db.from('supplier_stock').select('sku, supplier_id').in('sku', skus),
  ]);

  const supplierByStockSku = new Map(
    (supplierStockRows ?? []).map(r => [r.sku, r.supplier_id]),
  );

  // Fallback 1: match by supplier_sku value from product_stock → supplier_sku_map
  // (залежить від stockRows, тому виконується після Promise.all вище)
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
      ?? supplierByStockSku.get(item.sku)
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

  const skus = input.order_items.map(i => i.sku);

  // Незалежні запити паралельно (склад + собівартість + постачальники по SKU).
  const [{ data: warehouse }, { data: stockRows }, { data: skuMapRows }] = await Promise.all([
    db.from('warehouses').select('id').eq('is_default', true).single(),
    db.from('product_stock').select('sku, price_cost').in('sku', skus),
    db.from('supplier_sku_map').select('our_sku, supplier_id').in('our_sku', skus),
  ]);

  if (!warehouse) throw new Error('Default warehouse not found');

  const costMap = new Map(
    (stockRows ?? []).map(r => [r.sku, r.price_cost ?? 0]),
  );

  const supplierMap = new Map(
    (skuMapRows ?? []).map(r => [r.our_sku, r.supplier_id]),
  );

  // Активний договір клієнта
  let contractId: string | undefined;
  if (input.customer_id) {
    const { data: ctr } = await db
      .from('customer_contracts')
      .select('id')
      .eq('customer_id', input.customer_id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    contractId = ctr?.id ?? undefined;
  }

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
    customer_id:  input.customer_id ?? undefined,
    contract_id:  contractId,
    channel_code: input.channel_code ?? 'website',
    notes:        `Заказ #${input.order_number}`,
    created_by:   input.confirmed_by ?? 'system',
    doc_date:     input.business_date ? new Date(input.business_date).toISOString() : undefined,
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

  // Записуємо COGS для дропшип-рядків: confirmDocument не записує їх,
  // бо buildMovements пропускає fulfillment_type='dropship' (fifoCost=0).
  // recordShipment (виручка) НЕ викликаємо — confirmDocument вже зробив це.
  const dropshipCOGS = input.order_items.reduce((s, i) => {
    const src = plan.items.find(p => p.sku === i.sku);
    if (src?.fulfillment_type !== 'dropship') return s;
    return s + i.qty * (costMap.get(i.sku) ?? 0);
  }, 0);

  if (dropshipCOGS > 0) {
    await recordCOGS({
      amount:         dropshipCOGS,
      docId:          doc.id,
      orderId:        input.order_id,
      businessDate:   input.business_date,
      createdBy:      input.confirmed_by,
      idempotencyKey: `cogs:${input.order_id}:${doc.id}`,
    });
  }

  // Борг перед постачальниками за дропшип-рядки
  // Дебет inventory_asset / Кредит supplier — товар перейшов від постач. до клієнта транзитом
  const dropshipGroups = new Map<string, number>(); // supplierId → total cost
  for (const src of plan.items) {
    if (src.fulfillment_type !== 'dropship') continue;
    const supplierId = String(src.supplier_id ?? supplierMap.get(src.sku) ?? '');
    if (!supplierId || supplierId === 'null' || supplierId === 'undefined') continue;
    const orderItem = input.order_items.find(i => i.sku === src.sku);
    if (!orderItem) continue;
    const cost = (costMap.get(src.sku) ?? 0) * orderItem.qty;
    if (cost <= 0) continue;
    dropshipGroups.set(supplierId, (dropshipGroups.get(supplierId) ?? 0) + cost);
  }

  // Promise.all: якщо запис боргу перед постачальником впаде — транзакція
  // переривається повністю; allSettled мовчки ковтав помилку і лишав дисбаланс.
  await Promise.all(
    [...dropshipGroups.entries()].map(([supplierId, amount]) =>
      recordTxn({
        debitAccount:   'inventory_asset',
        creditAccount:  'supplier',
        creditParty:    supplierId,
        amount,
        businessDate:   input.business_date,
        docId:          doc.id,
        docType:        'sale',
        orderId:        input.order_id,
        description:    `Дропшип: борг перед постачальником (замовлення #${input.order_number})`,
        idempotencyKey: `dropship-payable:${input.order_id}:${supplierId}`,
        createdBy:      input.confirmed_by,
      }),
    ),
  );

  return doc.id;
}

// ── Сторно dropship-специфічних проводок при скасуванні замовлення ───────────
//
// recordDropshipSale() записує COGS і борг перед постачальником окремими
// recordTxn/recordCOGS викликами ПОЗА стандартним потоком confirmDocument
// (buildMovements пропускає fulfillment_type='dropship' — товар транзитом,
// на нашому складі його ніколи не було). Це означає, що cancelDocument()
// (яке створює сторно-документ і реверсує лінії через confirmDocument)
// реверсує виручку, але НЕ чіпає ці дві окремі проводки — вони лишаються
// висіти, наприклад показуючи борг постачальнику по скасованому замовленню.
//
// Реверсуємо не перерахунком (щоб не розійтися з оригіналом при зміні цін/
// собівартості між часом продажу і скасуванням), а прямим дзеркалюванням
// вже записаних проводок по цьому doc_id: для кожної транзакції міняємо
// дебет↔кредит місцями з тією ж сумою.
export async function reverseDropshipLedgerExtras(params: {
  orderId:     string;
  docId:       string;
  createdBy?:  string;
}): Promise<void> {
  const db = createServiceClient();

  const { data: entries } = await db
    .from('money_entries')
    .select('txn_id, account_type, counterparty_id, amount, description, doc_type')
    .eq('doc_id', params.docId)
    .in('account_type', ['cogs', 'supplier', 'inventory_asset']);

  if (!entries?.length) return;

  const byTxn = new Map<string, typeof entries>();
  for (const e of entries) {
    if (!byTxn.has(e.txn_id)) byTxn.set(e.txn_id, []);
    byTxn.get(e.txn_id)!.push(e);
  }

  const today = new Date().toISOString().slice(0, 10);

  for (const [txnId, legs] of byTxn) {
    // Reversal transactions created by this same function (below) also carry
    // account_type in (cogs, supplier, inventory_asset), so without this check a second
    // call would "reverse the reversal" — matched by doc_type: 'dropship_cancel' instead
    // of the original 'cogs'/'sale' doc_type recordCOGS/recordTxn used to post them.
    if (legs.every(l => l.doc_type === 'dropship_cancel')) continue;

    const reversalKey = `reversal:${txnId}`;
    const { data: already } = await db
      .from('money_entries')
      .select('id')
      .eq('idempotency_key', reversalKey)
      .maybeSingle();
    if (already) continue;

    const debitLeg  = legs.find(l => Number(l.amount) > 0);
    const creditLeg = legs.find(l => Number(l.amount) < 0);
    if (!debitLeg || !creditLeg) continue;

    await recordTxn({
      debitAccount:   creditLeg.account_type as AccountType,
      debitParty:     creditLeg.counterparty_id,
      creditAccount:  debitLeg.account_type as AccountType,
      creditParty:    debitLeg.counterparty_id,
      amount:         Math.abs(Number(debitLeg.amount)),
      businessDate:   today,
      docId:          params.docId,
      docType:        'dropship_cancel',
      orderId:        params.orderId,
      description:    `Сторно (скасування замовлення): ${debitLeg.description ?? ''}`.trim(),
      idempotencyKey: reversalKey,
      createdBy:      params.createdBy,
    });
  }
}
