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
import { createReservation, getOrderReservations } from './reservations';
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
  /** Фактичний постачальник відвантаження (orders.shipping_supplier_id).
   *  Якщо задано — увесь дропшип-борг відноситься на нього, а не на постачальника з мапінгу SKU. */
  shipping_supplier_id?: number | null;
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
    const supplierId = String(input.shipping_supplier_id ?? src.supplier_id ?? supplierMap.get(src.sku) ?? '');
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

// ── Варіант 3: розділення «створити РН-чернетку» (відгрузка) / «провести» (доставка) ──
// createSaleDraft — при відгрузці посилки: створює РН у статусі draft із ТТН цієї
// посилки, БЕЗ жодних проводок (резерв тримається). Проводка — postSaleDoc, коли
// посилку доставили. recordDropshipSale вище лишається старим шляхом (не чіпаємо).

export async function createSaleDraft(
  input: RecordDropshipSaleInput & { tracking_number?: string | null },
): Promise<string> {
  const db = createServiceClient();
  const skus = input.order_items.map(i => i.sku);

  const [{ data: warehouse }, { data: stockRows }] = await Promise.all([
    db.from('warehouses').select('id').eq('is_default', true).single(),
    db.from('product_stock').select('sku, price_cost').in('sku', skus),
  ]);
  if (!warehouse) throw new Error('Default warehouse not found');
  const costMap = new Map((stockRows ?? []).map(r => [r.sku, r.price_cost ?? 0]));

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

  const plan = await resolveOrderFulfillment(
    input.order_items.map(i => ({ sku: i.sku, qty: i.qty })),
    { channel_code: input.channel_code ?? 'website' },
  );

  const doc = await createDocument({
    doc_type:        'sale',
    warehouse_id:    warehouse.id,
    order_id:        input.order_id,
    customer_id:     input.customer_id ?? undefined,
    contract_id:     contractId,
    channel_code:    input.channel_code ?? 'website',
    tracking_number: input.tracking_number ?? undefined,
    notes:           `Заказ #${input.order_number}`,
    created_by:      input.confirmed_by ?? 'system',
    doc_date:        input.business_date ? new Date(input.business_date).toISOString() : undefined,
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

  // Борг перед постачальником виникає вже тут: постачальник передав товар
  // перевізникові і датує накладну цим днем. Помилка не має зривати
  // відвантаження — посилка фізично вже поїхала, а postSaleDoc при доставці
  // доведе борг як страховку.
  try {
    await syncDropshipPayable(doc.id, {
      shipping_supplier_id: input.shipping_supplier_id ?? null,
      business_date:        input.business_date,
      created_by:           input.confirmed_by,
    });
  } catch (err) {
    console.error('[dropship] борг при відвантаженні не проведено:', doc.id, err);
  }

  // Товар зі СВОГО складу фізично поїхав, а списується він лише при доставці
  // (Варіант 3: РН лишається чернеткою). У проміжку його має тримати резерв,
  // інакше залишок показує «доступно» на коробку, яка вже в дорозі, і той самий
  // товар можна продати вдруге. Живий випадок 28.08: клей 1603-016 і герметик
  // 1001-003 висіли доступними, хоч обидва їхали до покупців.
  //
  // Резерву тут може не бути взагалі: менеджер підтвердив замовлення як
  // «постачальник», а роутер при відгрузці знайшов товар на своєму складі.
  // Термін не ставимо — резерв знімає проведення при доставці або скасування
  // замовлення, а не годинник: посилка може їхати довше за будь-який TTL.
  try {
    await reserveShippedOwnStock(input.order_id, plan.items.filter(s => s.fulfillment_type === 'own'), input.order_items);
  } catch (err) {
    console.error('[dropship] резерв відвантаженого власного товару не створено:', doc.id, err);
  }

  return doc.id;
}

/**
 * Тримає власний товар зарезервованим, доки посилка їде. Резервує лише те, чого
 * ще не тримає активний резерв цього ж замовлення: reserve_order_items вставляє
 * рядок без перевірок, тож повторний виклик інакше подвоїв би резерв.
 */
async function reserveShippedOwnStock(
  orderId: string,
  ownSources: { sku: string; qty: number; warehouse_id: number }[],
  orderItems: { sku: string; qty: number }[],
): Promise<void> {
  if (!ownSources.length) return;

  const already = new Map<string, number>();
  for (const r of await getOrderReservations(orderId)) {
    already.set(r.sku as string, (already.get(r.sku as string) ?? 0) + Number(r.qty));
  }

  const byWarehouse = new Map<number, { sku: string; qty: number }[]>();
  for (const src of ownSources) {
    const shipped = orderItems.find(i => i.sku === src.sku)?.qty ?? src.qty;
    const need = Math.min(Number(src.qty), Number(shipped)) - (already.get(src.sku) ?? 0);
    if (need <= 0) continue;
    if (!byWarehouse.has(src.warehouse_id)) byWarehouse.set(src.warehouse_id, []);
    byWarehouse.get(src.warehouse_id)!.push({ sku: src.sku, qty: need });
  }

  for (const [warehouseId, items] of byWarehouse) {
    const res = await createReservation({ order_id: orderId, warehouse_id: warehouseId, items });
    // Не вистачило залишку — відгрузку не спиняємо (коробка вже поїхала), але
    // мовчати не можна: склад розійшовся з фактом ще ДО цієї відгрузки.
    if (res.insufficient.length) {
      console.error('[dropship] не вистачило залишку на резерв відвантаженого:', orderId, res.insufficient);
    }
  }
}

// syncSaleDraftLines — коли редагують позиції замовлення (к-сть/ціна/склад товарів),
// а РН-чернетка вже створена при відвантаженні, її рядки треба привести у
// відповідність до нових позицій. Інакше при доставці виручка/COGS/комісія
// маркетплейсу порахуються по СТАРІЙ кількості (комісія рахується по рядках РН,
// а не по orders.items) — саме через це недобиралась комісія при дозамовленні.
//
// Логіка єдина для всіх каналів (Prom/Rozetka/сайт). Безпечні межі:
//   - є підтверджена РН (вже доставлено, проводки зроблені) → НЕ чіпаємо, needsManual
//     (потрібна дельта виручки/комісії — робиться окремо);
//   - кілька чернеток (мультипосилка) → не вгадуємо, яка змінилась → needsManual;
//   - рівно одна чернетка → пересобираємо її рядки.
export async function syncSaleDraftLines(
  orderId: string,
  items: { sku: string; qty: number; price: number }[],
  by = 'system',
): Promise<{ synced: number; needsManual: boolean; reason?: string }> {
  const db = createServiceClient();

  const { data: docs } = await db
    .from('acc_documents')
    .select('id, status')
    .eq('order_id', orderId)
    .eq('doc_type', 'sale');
  const all = docs ?? [];
  const drafts = all.filter(d => d.status === 'draft');
  const hasConfirmed = all.some(d => d.status === 'confirmed');

  if (hasConfirmed) return { synced: 0, needsManual: true, reason: 'confirmed_sale_doc' };
  if (drafts.length === 0) return { synced: 0, needsManual: false };
  if (drafts.length > 1)  return { synced: 0, needsManual: true, reason: 'multiple_draft_parcels' };

  const docId = drafts[0].id;
  const skus = items.map(i => i.sku);

  const [{ data: warehouse }, { data: stockRows }, { data: order }] = await Promise.all([
    db.from('warehouses').select('id').eq('is_default', true).single(),
    db.from('product_stock').select('sku, price_cost').in('sku', skus),
    db.from('orders').select('channel_code').eq('id', orderId).single(),
  ]);
  const costMap = new Map((stockRows ?? []).map(r => [r.sku, r.price_cost ?? 0]));

  const plan = await resolveOrderFulfillment(
    items.map(i => ({ sku: i.sku, qty: i.qty })),
    { channel_code: order?.channel_code ?? 'website' },
  );

  const newLines = items.map((item, i) => {
    const source = plan.items.find(s => s.sku === item.sku);
    return {
      document_id:      docId,
      sku:              item.sku,
      qty:              item.qty,
      price:            item.price,
      cost_price:       costMap.get(item.sku) ?? 0,
      fulfillment_type: source?.fulfillment_type ?? 'dropship',
      warehouse_id:     source?.warehouse_id ?? null,
      supplier_id:      source?.supplier_id ?? null,
      sort_order:       i,
    };
  });

  await db.from('acc_document_lines').delete().eq('document_id', docId);
  const { error } = await db.from('acc_document_lines').insert(newLines);
  if (error) throw new Error((error as { message?: string }).message ?? String(error));

  // Позиції змінились — отже змінився і борг перед постачальником: він виник
  // ще при відвантаженні, тож зводимо його під нові рядки, а не чекаємо доставки.
  await syncDropshipPayable(docId, { created_by: by });

  return { synced: 1, needsManual: false };
}

// ── Борг перед постачальником: виникає при ВІДВАНТАЖЕННІ ─────────────────────
//
// Постачальник виписує накладну датою передачі посилки перевізникові, тож і борг
// у нас має виникати тоді ж, а не при врученні покупцю (до міграції 103 було саме
// так, і звірка з постачальником розходилась рівно на суму товару «в дорозі»).
//
//   відвантаження:  DR inventory_transit / CR supplier
//   доставка:       DR cogs              / CR inventory_transit   (postSaleDoc)
//
// Функція не «нараховує», а ЗВОДИТЬ: рахує, скільки має бути за поточними рядками
// РН, дивиться, скільки вже проведено по цьому документу, і пише різницю. Тому її
// безпечно кликати повторно — і при створенні чернетки, і після редагування
// позицій замовлення (syncSaleDraftLines), і з бекфіл-скрипта, і як страховку
// при доставці.
export async function syncDropshipPayable(
  docId: string,
  opts: { shipping_supplier_id?: number | null; business_date?: string; created_by?: string } = {},
): Promise<{ changed: number }> {
  const db = createServiceClient();

  const { data: doc } = await db
    .from('acc_documents')
    .select('id, order_id, status')
    .eq('id', docId)
    .maybeSingle();
  if (!doc) throw new Error(`syncDropshipPayable: документ ${docId} не знайдено`);
  // Скасований документ не чіпаємо: долю товару в дорозі вирішує людина
  // (повернули постачальнику / лишили собі), а не перерахунок рядків.
  if (doc.status === 'cancelled') return { changed: 0 };

  const { data: lines } = await db
    .from('acc_document_lines')
    .select('sku, qty, cost_price, fulfillment_type, supplier_id')
    .eq('document_id', docId);
  const dropLines = (lines ?? []).filter(l => l.fulfillment_type === 'dropship');

  // Постачальник рядка: override із замовлення → рядок РН → мапінг SKU
  let supplierMap: Map<string, number | null> | null = null;
  if (dropLines.some(l => !opts.shipping_supplier_id && !l.supplier_id)) {
    const { data: m } = await db
      .from('supplier_sku_map')
      .select('our_sku, supplier_id')
      .in('our_sku', dropLines.map(l => l.sku));
    supplierMap = new Map((m ?? []).map(r => [r.our_sku, r.supplier_id]));
  }

  // Рахунок у копійках: на double різниця двох сум дає «хвости» на 0,01 ₴,
  // і кожен виклик писав би копійчану проводку-коригування.
  const kop = (n: number) => Math.round(n * 100);

  const desired = new Map<string, number>();
  for (const l of dropLines) {
    const supplierId = String(opts.shipping_supplier_id ?? l.supplier_id ?? supplierMap?.get(l.sku) ?? '');
    if (!supplierId || supplierId === 'null' || supplierId === 'undefined') continue;
    const cost = kop(Number(l.cost_price ?? 0) * Number(l.qty));
    if (cost <= 0) continue;
    desired.set(supplierId, (desired.get(supplierId) ?? 0) + cost);
  }

  // Скільки вже проведено по цьому документу: борг іде мінусом на рахунку
  // постачальника, сторно і коригування — плюсом, тож сума дає чистий залишок.
  const { data: postedRows } = await db
    .from('money_entries')
    .select('counterparty_id, amount')
    .eq('doc_id', docId)
    .eq('account_type', 'supplier')
    .limit(1000);
  const posted = new Map<string, number>();
  const seenCount = new Map<string, number>();
  for (const e of postedRows ?? []) {
    const k = String(e.counterparty_id);
    posted.set(k, (posted.get(k) ?? 0) - kop(Number(e.amount)));
    seenCount.set(k, (seenCount.get(k) ?? 0) + 1);
  }

  let orderNumber: number | null = null;
  if (doc.order_id) {
    const { data: ord } = await db.from('orders').select('order_number').eq('id', doc.order_id).maybeSingle();
    orderNumber = (ord?.order_number as number) ?? null;
  }
  const suffix = orderNumber ? ` (замовлення #${orderNumber})` : '';

  let changed = 0;
  for (const supplierId of new Set([...desired.keys(), ...posted.keys()])) {
    const delta = (desired.get(supplierId) ?? 0) - (posted.get(supplierId) ?? 0);
    if (Math.abs(delta) < 1) continue;
    const seen = seenCount.get(supplierId) ?? 0;
    await recordTxn({
      // Зростання боргу — товар пішов від постачальника в дорогу; зменшення —
      // дзеркально (зменшили кількість у замовленні ще до вручення).
      debitAccount:   delta > 0 ? 'inventory_transit' : 'supplier',
      debitParty:     delta > 0 ? null : supplierId,
      creditAccount:  delta > 0 ? 'supplier' : 'inventory_transit',
      creditParty:    delta > 0 ? supplierId : null,
      amount:         Math.abs(delta) / 100,
      businessDate:   opts.business_date,
      docId,
      docType:        'sale',
      orderId:        doc.order_id ?? undefined,
      description:    delta > 0
        ? `Дропшип: борг перед постачальником${suffix}`
        : `Дропшип: коригування боргу${suffix}`,
      // Перша проводка лишає історичний ключ (щоб не задвоїти борг по документах,
      // проведених до міграції 103); наступні нумеруються станом леджера, тож
      // повтор після збою дає той самий ключ і нічого не дублює.
      idempotencyKey: seen === 0
        ? `dropship-payable:${docId}:${supplierId}`
        : `dropship-payable-adj:${docId}:${supplierId}:${seen}`,
      createdBy:      opts.created_by,
    });
    changed++;
  }
  return { changed };
}

// postSaleDoc — проводить конкретну РН (draft → confirmed): виручка + FIFO/COGS по
// власних рядках + зняття резерву (все всередині confirmDocument) + дропшип-COGS та
// борг перед постачальником по dropship-рядках. Працює лише за docId (читає рядки
// самої накладної), бо при доставці ми маємо саме документ. Ідемпотентно: якщо РН
// вже проведена — тихо виходить; ключі проводок per-doc (щоб мультипосилки не злипались).
export async function postSaleDoc(
  docId: string,
  opts: { confirmed_by?: string; business_date?: string; shipping_supplier_id?: number | null } = {},
): Promise<void> {
  const db = createServiceClient();

  const { data: doc } = await db
    .from('acc_documents')
    .select('id, order_id, status')
    .eq('id', docId)
    .single();
  if (!doc) throw new Error(`postSaleDoc: документ ${docId} не знайдено`);
  if (doc.status !== 'draft') return; // вже проведено — ідемпотентний вихід

  const by = opts.confirmed_by ?? 'system';
  await confirmDocument(docId, by);

  const { data: lines } = await db
    .from('acc_document_lines')
    .select('sku, qty, cost_price, fulfillment_type, supplier_id')
    .eq('document_id', docId);
  const dropLines = (lines ?? []).filter(l => l.fulfillment_type === 'dropship');

  // Страховка для чернеток, створених до міграції 103: тоді борг при
  // відвантаженні не проводився, і собівартість списалася б із порожнього
  // транзиту. Для нових РН різниця нульова — жодної проводки не буде.
  await syncDropshipPayable(docId, {
    shipping_supplier_id: opts.shipping_supplier_id,
    business_date:        opts.business_date,
    created_by:           by,
  });

  const dropshipCOGS = dropLines.reduce(
    (s, l) => s + Number(l.qty) * Number(l.cost_price ?? 0), 0,
  );
  if (dropshipCOGS > 0) {
    await recordCOGS({
      amount:         dropshipCOGS,
      docId,
      orderId:        doc.order_id ?? undefined,
      businessDate:   opts.business_date,
      createdBy:      by,
      // Дропшип-товар на нашому складі не був: списуємо з транзиту, куди його
      // поставив syncDropshipPayable у момент відвантаження.
      creditAccount:  'inventory_transit',
      idempotencyKey: `cogs:${doc.order_id}:${docId}`,
    });
  }

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
    .in('account_type', ['cogs', 'supplier', 'inventory_asset', 'inventory_transit']);

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
