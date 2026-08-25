// Товар у дорозі: що з ним сталося, якщо посилку не вручили.
//
// З міграції 103 борг перед постачальником виникає при відвантаженні, а товар
// стає на рахунок 'inventory_transit'. Коли посилку доставили — транзит
// закривається собівартістю (postSaleDoc). Коли покупець відмовився — транзит
// лишається висіти, і це НЕ можна вирішити автоматично: товар або поїде назад
// постачальнику (тоді борг знімається), або лишиться в нас на складі (тоді борг
// лишається, а товар треба оприбуткувати). Вибір робить людина.
//
// Модуль дає три речі: скільки транзиту висить по замовленню, список того, що
// чекає рішення, і саме проведення рішення.

import { createServiceClient } from '../supabase';
import { recordTxn } from './money';
import { createDocument, confirmDocument, cancelDocument } from './documents';
import { planAllocation } from './allocation';

export type TransitDecision = 'to_supplier' | 'keep';

export type PendingTransit = {
  docId:        string;
  docNumber:    string | null;
  docDate:      string;
  orderId:      string | null;
  orderNumber:  number | null;
  orderStatus:  string | null;
  trackingNumber: string | null;
  amount:       number;              // скільки товару висить у дорозі, ₴
  suppliers:    { id: number; name: string; amount: number }[];
};

/** Скільки товару по замовленню зараз висить «у дорозі» (0 — нічого не висить). */
export async function transitBalanceForOrder(orderId: string): Promise<number> {
  const db = createServiceClient();
  const { data } = await db
    .from('money_entries')
    .select('amount')
    .eq('order_id', orderId)
    .eq('account_type', 'inventory_transit')
    .limit(1000);
  const net = (data ?? []).reduce((s, r) => s + Number(r.amount), 0);
  return Math.round(net * 100) / 100;
}

/**
 * Посилки, що чекають рішення: транзит ще висить, а замовлення вже скасоване
 * (покупець відмовився / посилка їде назад). Доставлені сюди не потрапляють —
 * там транзит закритий собівартістю.
 */
export async function pendingTransitDecisions(): Promise<PendingTransit[]> {
  const db = createServiceClient();

  const { data: entries } = await db
    .from('money_entries')
    .select('doc_id, order_id, amount')
    .eq('account_type', 'inventory_transit')
    .not('doc_id', 'is', null)
    .limit(5000);

  const netByDoc = new Map<string, { net: number; orderId: string | null }>();
  for (const e of entries ?? []) {
    const k = String(e.doc_id);
    const prev = netByDoc.get(k) ?? { net: 0, orderId: (e.order_id as string) ?? null };
    netByDoc.set(k, { net: prev.net + Number(e.amount), orderId: prev.orderId ?? (e.order_id as string) ?? null });
  }
  const openDocs = [...netByDoc.entries()].filter(([, v]) => v.net > 0.005);
  if (!openDocs.length) return [];

  const orderIds = [...new Set(openDocs.map(([, v]) => v.orderId).filter(Boolean))] as string[];
  const { data: orders } = orderIds.length
    ? await db.from('orders').select('id, order_number, status').in('id', orderIds)
    : { data: [] };
  const orderById = new Map((orders ?? []).map(o => [o.id as string, o]));

  // Рішення потрібне тільки там, де замовлення вже не відбудеться
  const needDecision = openDocs.filter(([, v]) => {
    const ord = v.orderId ? orderById.get(v.orderId) : null;
    return ord?.status === 'cancelled';
  });
  if (!needDecision.length) return [];

  const docIds = needDecision.map(([id]) => id);
  const { data: docs } = await db
    .from('acc_documents')
    .select('id, doc_number, doc_date, tracking_number')
    .in('id', docIds);
  const docById = new Map((docs ?? []).map(d => [d.id as string, d]));

  // Розклад по постачальниках — щоб було видно, кому саме повертати
  const { data: supEntries } = await db
    .from('money_entries')
    .select('doc_id, counterparty_id, amount')
    .in('doc_id', docIds)
    .eq('account_type', 'supplier')
    .limit(5000);
  const bySupplier = new Map<string, Map<number, number>>();
  for (const e of supEntries ?? []) {
    const k = String(e.doc_id);
    const sid = Number(e.counterparty_id);
    if (!Number.isFinite(sid)) continue;
    if (!bySupplier.has(k)) bySupplier.set(k, new Map());
    const m = bySupplier.get(k)!;
    m.set(sid, (m.get(sid) ?? 0) - Number(e.amount));
  }
  const supplierIds = [...new Set([...bySupplier.values()].flatMap(m => [...m.keys()]))];
  const { data: sups } = supplierIds.length
    ? await db.from('suppliers').select('id, name').in('id', supplierIds)
    : { data: [] };
  const supName = new Map((sups ?? []).map(s => [s.id as number, s.name as string]));

  return needDecision.map(([docId, v]) => {
    const doc = docById.get(docId);
    const ord = v.orderId ? orderById.get(v.orderId) : null;
    return {
      docId,
      docNumber:      (doc?.doc_number as string) ?? null,
      docDate:        String(doc?.doc_date ?? '').slice(0, 10),
      orderId:        v.orderId,
      orderNumber:    (ord?.order_number as number) ?? null,
      orderStatus:    (ord?.status as string) ?? null,
      trackingNumber: (doc?.tracking_number as string) ?? null,
      amount:         Math.round(v.net * 100) / 100,
      suppliers: [...(bySupplier.get(docId) ?? new Map()).entries()]
        .filter(([, amt]) => amt > 0.005)
        .map(([id, amt]) => ({ id, name: supName.get(id) ?? `Постачальник #${id}`, amount: Math.round(amt * 100) / 100 })),
    };
  }).sort((a, b) => a.docDate.localeCompare(b.docDate));
}

/**
 * Провести рішення по посилці, що повернулась.
 *
 *   to_supplier — товар поїхав назад постачальнику: DR supplier / CR inventory_transit.
 *                 Борг знімається, і сторно одразу «гасить» ту саму накладну в
 *                 рознесенні оплат, інакше вона висіла б неоплаченою назавжди.
 *   keep        — товар лишається в нас: оприбутковуємо на склад документом
 *                 stock_in (без постачальника, щоб не виник ДРУГИЙ борг) і
 *                 переносимо вартість DR inventory_asset / CR inventory_transit.
 *                 Борг перед постачальником лишається — товар справді наш.
 *
 * У обох випадках РН-чернетка скасовується: посилка не відбулась, і в списку
 * «в дорозі» їй більше не місце. Ідемпотентно за ключами проводок.
 */
export async function resolveTransit(params: {
  docId:     string;
  decision:  TransitDecision;
  createdBy?: string;
}): Promise<{ amount: number }> {
  const db = createServiceClient();
  const by = params.createdBy ?? 'admin';

  const { data: doc } = await db
    .from('acc_documents')
    .select('id, order_id, status, warehouse_id, doc_date')
    .eq('id', params.docId)
    .maybeSingle();
  if (!doc) throw new Error('Документ не знайдено');

  const { data: transitRows } = await db
    .from('money_entries')
    .select('amount')
    .eq('doc_id', params.docId)
    .eq('account_type', 'inventory_transit')
    .limit(1000);
  const transitLeft = Math.round((transitRows ?? []).reduce((s, r) => s + Number(r.amount), 0) * 100) / 100;
  if (transitLeft <= 0.005) throw new Error('По цій посилці товар у дорозі вже не висить');

  const today = new Date().toISOString().slice(0, 10);

  if (params.decision === 'to_supplier') {
    // Знімаємо борг тим самим розкладом по постачальниках, яким його нараховували
    const { data: supEntries } = await db
      .from('money_entries')
      .select('id, counterparty_id, amount, business_date')
      .eq('doc_id', params.docId)
      .eq('account_type', 'supplier')
      .limit(1000);

    const owed = new Map<string, number>();
    for (const e of supEntries ?? []) {
      const k = String(e.counterparty_id);
      owed.set(k, (owed.get(k) ?? 0) - Number(e.amount));
    }

    for (const [supplierId, amount] of owed) {
      if (amount <= 0.005) continue;
      const key = `transit-return:${params.docId}:${supplierId}`;
      await recordTxn({
        debitAccount:   'supplier',
        debitParty:     supplierId,
        creditAccount:  'inventory_transit',
        amount,
        businessDate:   today,
        docId:          params.docId,
        docType:        'dropship_cancel',
        orderId:        doc.order_id ?? undefined,
        description:    'Товар повернувся постачальнику: зняття боргу',
        idempotencyKey: key,
        createdBy:      by,
      });

      // recordTxn віддає txn_id, а рознесення прив'язується до КОНКРЕТНОЇ
      // проводки — знаходимо її за тим самим ідемпотентним ключем.
      const { data: reversalEntry } = await db
        .from('money_entries')
        .select('id')
        .eq('idempotency_key', key)
        .eq('account_type', 'supplier')
        .maybeSingle();

      // Гасимо саме ті накладні, які цим сторно закриваються: інакше борг
      // лишиться в списку «неоплачені», а сторно висітиме як зайвий аванс.
      const charges = (supEntries ?? [])
        .filter(e => String(e.counterparty_id) === supplierId && Number(e.amount) < 0)
        .map(e => ({ id: e.id as string, date: String(e.business_date ?? today), remaining: Math.abs(Number(e.amount)) }));
      const { data: existing } = await db
        .from('supplier_payment_allocations')
        .select('charge_entry_id, amount')
        .in('charge_entry_id', charges.map(c => c.id));
      const used = new Map<string, number>();
      for (const a of existing ?? []) {
        used.set(a.charge_entry_id as string, (used.get(a.charge_entry_id as string) ?? 0) + Number(a.amount));
      }
      const open = charges
        .map(c => ({ ...c, remaining: Math.round((c.remaining - (used.get(c.id) ?? 0)) * 100) / 100 }))
        .filter(c => c.remaining > 0);

      const plan = planAllocation(open, amount, 'oldest');
      if (plan.lines.length && reversalEntry) {
        await db.from('supplier_payment_allocations').insert(
          plan.lines.map(l => ({
            payment_entry_id: reversalEntry.id,
            charge_entry_id:  l.chargeId,
            amount:           l.amount,
            created_by:       by,
          })),
        );
      }
    }
  } else {
    // Товар лишається в нас: спершу оприбуткування (створить FIFO-партію),
    // потім перенос вартості з транзиту на склад.
    const { data: lines } = await db
      .from('acc_document_lines')
      .select('sku, qty, price, cost_price, fulfillment_type, supplier_id')
      .eq('document_id', params.docId);
    const dropLines = (lines ?? []).filter(l => l.fulfillment_type === 'dropship');
    if (!dropLines.length) throw new Error('У документі немає дропшип-рядків');

    const { data: warehouse } = await db.from('warehouses').select('id').eq('is_default', true).single();
    const warehouseId = (doc.warehouse_id as number) ?? warehouse?.id;
    if (!warehouseId) throw new Error('Немає складу для оприбуткування');

    // Ідемпотентність: якщо прихід уже створювали — другий раз не створюємо
    const { data: prior } = await db
      .from('acc_documents')
      .select('id')
      .eq('parent_doc_id', params.docId)
      .eq('doc_type', 'stock_in')
      .maybeSingle();

    if (!prior) {
      const stockIn = await createDocument({
        doc_type:      'stock_in',
        warehouse_id:  warehouseId,
        parent_doc_id: params.docId,
        order_id:      doc.order_id ?? undefined,
        // supplier_id НЕ ставимо навмисно: інакше confirmDocument запише ще один
        // борг перед постачальником (recordPurchase), а він уже є з відвантаження.
        notes:         'Товар із неврученої посилки лишається на складі',
        created_by:    by,
        lines: dropLines.map(l => ({
          sku:              l.sku as string,
          qty:              Number(l.qty),
          price:            Number(l.price ?? l.cost_price ?? 0),
          cost_price:       Number(l.cost_price ?? 0),
          fulfillment_type: 'own' as const,
          warehouse_id:     warehouseId,
          supplier_id:      (l.supplier_id as number) ?? undefined,
        })),
      });
      await confirmDocument(stockIn.id, by);
    }

    await recordTxn({
      debitAccount:   'inventory_asset',
      creditAccount:  'inventory_transit',
      amount:         transitLeft,
      businessDate:   today,
      docId:          params.docId,
      docType:        'stock_in',
      orderId:        doc.order_id ?? undefined,
      description:    'Товар із неврученої посилки оприбутковано на склад',
      idempotencyKey: `transit-keep:${params.docId}`,
      createdBy:      by,
    });
  }

  // Посилка не відбулась — чернетка більше не «в дорозі»
  if (doc.status === 'draft') {
    await cancelDocument(params.docId, by, params.decision === 'keep'
      ? 'Товар лишився на складі'
      : 'Товар повернуто постачальнику');
  }

  return { amount: transitLeft };
}
