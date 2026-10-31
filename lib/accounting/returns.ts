// Документ «Повернення» — робота з базою. Правила — в returns-rules.ts.
//
// ПВ (return_in): createCustomerReturn → чернетка «очікуємо товар» (жодних
// проводок) → receiveCustomerReturn → confirmDocument (товар на склад новою
// FIFO-партією, сторно виручки й собівартості) + сторно комісії маркетплейсу
// (якщо площадка в курсі) + повернення коштів покупцю (якщо просили).
// Дропшип-рядки теж приходуються на НАШ склад: товар фізично приїздить до нас,
// а борг постачальнику зменшиться лише документом ПП, коли ми його відправимо.
//
// ПП (supplier_return): createSupplierReturn на підставі ПВ / приходу / залишків
// → одразу проводиться (склад OUT + DR supplier / CR inventory_asset), стадія
// «відправлено»; acceptSupplierReturn лише фіксує дату прийняття.

import { createServiceClient, createTypedServiceClient } from '../supabase';
import { createDocument, confirmDocument, cancelDocument, getDocument, resolveSaleDebitParty } from './documents';
import { recordTxn, reverseMarketplaceCommission } from './money';
import type { AccDocumentWithLines } from './types';
import {
  MARKETPLACE_CHANNELS, actionsFor, commissionToReverse, kindOf, returnTotal, returnableBySku,
  stageOf, timelineFor, validateRequestedQty,
  type ReturnKind, type ReturnMeta, type ReturnReason, type ReturnStage, type RefundMethod,
  type ReturnActions, type TimelineStep,
} from './returns-rules';

type Db = ReturnType<typeof createServiceClient>;

const RETURN_TYPES = ['return_in', 'supplier_return'];
const round2 = (n: number) => Math.round(n * 100) / 100;

function metaOf(doc: { meta?: unknown }): ReturnMeta | null {
  const m = (doc.meta as Record<string, unknown> | null)?.return;
  return m && typeof m === 'object' ? (m as ReturnMeta) : null;
}

async function patchReturnMeta(db: Db, docId: string, patch: Partial<ReturnMeta>): Promise<ReturnMeta> {
  const { data } = await db.from('acc_documents').select('meta').eq('id', docId).single();
  const meta = (data?.meta ?? {}) as Record<string, unknown>;
  const next = { ...((meta.return as ReturnMeta | undefined) ?? {}), ...patch } as ReturnMeta;
  const { error } = await db.from('acc_documents').update({ meta: { ...meta, return: next } }).eq('id', docId);
  if (error) throw new Error(error.message);
  return next;
}

async function productNames(db: Db, skus: string[]): Promise<Map<string, string>> {
  if (!skus.length) return new Map();
  const { data } = await db.from('products').select('sku, name, brand').in('sku', [...new Set(skus)]).limit(skus.length);
  return new Map((data ?? []).map(p => [p.sku as string, `${p.brand ?? ''} ${p.name}`.trim()]));
}

// ── Що можна повернути по замовленню ─────────────────────────────────────────

type SaleLineState = {
  shipped: number; returned: number; price: number; cost_price: number;
  fulfillment_type: string | null; supplier_id: number | null;
};

async function loadOrderReturnState(db: Db, orderId: string) {
  const { data: saleDocs } = await db
    .from('acc_documents')
    .select('id, doc_date')
    .eq('order_id', orderId).eq('doc_type', 'sale').eq('status', 'confirmed')
    .is('reversal_of', null)
    .order('doc_date', { ascending: true })
    .limit(100);
  const saleIds = (saleDocs ?? []).map(d => d.id as string);
  const lastSaleId = saleIds.length ? saleIds[saleIds.length - 1] : null;

  // Чернетки-заявки теж тримають кількість — інакше по одній позиції можна
  // відкрити дві заявки.
  const { data: returnDocs } = await db
    .from('acc_documents')
    .select('id')
    .eq('order_id', orderId).eq('doc_type', 'return_in')
    .neq('status', 'cancelled')
    .is('reversal_of', null)
    .limit(100);
  const returnIds = (returnDocs ?? []).map(d => d.id as string);

  const saleLines = saleIds.length
    ? ((await db.from('acc_document_lines')
        .select('sku, qty, price, cost_price, fulfillment_type, supplier_id')
        .in('document_id', saleIds).limit(1000)).data ?? [])
    : [];
  const returnedLines = returnIds.length
    ? ((await db.from('acc_document_lines').select('sku, qty').in('document_id', returnIds).limit(1000)).data ?? [])
    : [];

  const state = new Map<string, SaleLineState>();
  for (const l of saleLines) {
    const s = state.get(l.sku) ?? {
      shipped: 0, returned: 0, price: Number(l.price), cost_price: Number(l.cost_price ?? 0),
      fulfillment_type: l.fulfillment_type as string | null, supplier_id: l.supplier_id as number | null,
    };
    s.shipped += Number(l.qty);
    state.set(l.sku, s);
  }
  for (const l of returnedLines) {
    const s = state.get(l.sku);
    if (s) s.returned += Number(l.qty);
  }
  return { state, hasSale: saleIds.length > 0, lastSaleId };
}

export type ReturnableItem = {
  sku: string; name: string; price: number; shipped: number; returned: number; available: number;
  fulfillment_type: string | null;
};

export async function getReturnableItems(orderId: string): Promise<{
  items: ReturnableItem[]; hasSale: boolean; channel_code: string | null; is_marketplace: boolean;
  existing: Array<{ id: string; doc_number: string; stage: ReturnStage; status: string }>;
}> {
  const db = createTypedServiceClient();
  const { state, hasSale } = await loadOrderReturnState(db, orderId);
  const { data: order } = await db.from('orders').select('items, channel_code').eq('id', orderId).single();
  const names = new Map(((order?.items ?? []) as { sku: string; name: string; brand?: string }[])
    .map(i => [i.sku, [i.brand, i.name].filter(Boolean).join(' ')]));
  const { data: existing } = await db
    .from('acc_documents')
    .select('id, doc_number, status, meta, doc_type')
    .eq('order_id', orderId).eq('doc_type', 'return_in')
    .is('reversal_of', null)
    .order('doc_date', { ascending: false })
    .limit(20);
  const channel = (order?.channel_code as string | null) ?? null;
  return {
    hasSale,
    channel_code: channel,
    is_marketplace: !!channel && MARKETPLACE_CHANNELS.has(channel),
    items: [...state.entries()].map(([sku, s]) => ({
      sku,
      name: names.get(sku) ?? sku,
      price: s.price,
      shipped: s.shipped,
      returned: s.returned,
      available: Math.max(0, s.shipped - s.returned),
      fulfillment_type: s.fulfillment_type,
    })).filter(i => i.available > 0 || i.returned > 0),
    existing: (existing ?? []).map(d => ({
      id: d.id as string, doc_number: d.doc_number as string, status: d.status as string,
      stage: stageOf(metaOf(d), d.doc_type as string, d.status as string),
    })),
  };
}

// ── ПВ: заявка на повернення від покупця ─────────────────────────────────────

export type CreateCustomerReturnInput = {
  orderId: string;
  items: Array<{ sku: string; qty: number }>;
  reason: ReturnReason;
  reasonText?: string | null;
  ttn?: string | null;
  mpUnaware?: boolean;
  refund?: { method: RefundMethod } | null;
  createdBy: string;
  meta?: Record<string, unknown>;
};

export async function createCustomerReturn(input: CreateCustomerReturnInput): Promise<{ id: string; doc_number: string; total: number }> {
  const db = createTypedServiceClient();
  const items = input.items.filter(i => Number(i.qty) > 0).map(i => ({ sku: i.sku, qty: Number(i.qty) }));
  if (!items.length) throw new Error('Не обрано позицій');

  const { data: order } = await db
    .from('orders')
    .select('id, order_number, customer_id, channel_code, shipping_supplier_id')
    .eq('id', input.orderId)
    .single();
  if (!order) throw new Error('Замовлення не знайдено');

  const { state, hasSale, lastSaleId } = await loadOrderReturnState(db, input.orderId);
  if (!hasSale) throw new Error('Немає підтвердженої РН — повертати нічого');

  const available = returnableBySku(
    [...state.entries()].map(([sku, s]) => ({ sku, qty: s.shipped })),
    [...state.entries()].map(([sku, s]) => ({ sku, qty: s.returned })),
  );
  const err = validateRequestedQty(items, available);
  if (err) throw new Error(err);

  const { data: warehouse } = await db.from('warehouses').select('id').eq('is_default', true).single();
  if (!warehouse) throw new Error('Немає дефолтного складу');

  const isMp = !!order.channel_code && MARKETPLACE_CHANNELS.has(order.channel_code);
  const returnMeta: ReturnMeta = {
    kind: 'customer',
    stage: 'awaiting',
    reason: input.reason,
    reason_text: input.reasonText?.trim() || null,
    ttn: input.ttn?.trim() || null,
    mp_unaware: isMp ? !!input.mpUnaware : false,
    refund: input.refund ?? null,
  };

  const doc = await createDocument({
    doc_type:      'return_in',
    warehouse_id:  warehouse.id,
    parent_doc_id: lastSaleId ?? undefined,
    order_id:      order.id,
    customer_id:   order.customer_id ?? undefined,
    channel_code:  order.channel_code ?? 'website',
    tracking_number: returnMeta.ttn ?? undefined,
    notes:         `Повернення від покупця по замовленню #${order.order_number}${returnMeta.reason_text ? ` — ${returnMeta.reason_text}` : ''}`,
    created_by:    input.createdBy,
    meta:          { ...(input.meta ?? {}), return: returnMeta },
    // Усі рядки — «own»: товар приїздить на наш склад, і дропшиповий теж
    // (buildMovements пропускає dropship-рядки, а нам потрібна FIFO-партія).
    lines: items.map(item => {
      const s = state.get(item.sku)!;
      const supplierId = s.supplier_id ?? (s.fulfillment_type === 'dropship' ? order.shipping_supplier_id : null);
      return {
        sku:              item.sku,
        qty:              item.qty,
        price:            s.price,
        cost_price:       s.cost_price,
        fulfillment_type: 'own' as const,
        warehouse_id:     warehouse.id,
        supplier_id:      supplierId ?? undefined,
        meta:             { origin_fulfillment: s.fulfillment_type ?? 'own' },
      };
    }),
  });

  const total = round2(items.reduce((s, i) => s + state.get(i.sku)!.price * i.qty, 0));
  return { id: doc.id, doc_number: doc.doc_number, total };
}

// ── ПВ: товар отримано → проведення ──────────────────────────────────────────

export async function receiveCustomerReturn(input: {
  docId: string;
  receivedAt?: string | null;        // YYYY-MM-DD — дата проводок
  refund?: { method: RefundMethod } | null;
  confirmedBy: string;
}): Promise<{ doc_number: string; total: number; commission_reversed: number; refunded: number }> {
  const db = createTypedServiceClient();
  const doc = await getDocument(input.docId);
  if (!doc) throw new Error('Документ не знайдено');
  if (doc.doc_type !== 'return_in' || doc.reversal_of) throw new Error('Це не повернення від покупця');
  if (doc.status !== 'draft') throw new Error(`Документ уже ${doc.status === 'confirmed' ? 'проведено' : 'скасовано'}`);

  const meta = metaOf(doc);
  const refund = input.refund === undefined ? (meta?.refund ?? null) : input.refund;
  const total = returnTotal('customer', doc.lines);

  // Проводки — датою отримання товару, а не датою заявки
  const bizDate = (input.receivedAt && /^\d{4}-\d{2}-\d{2}$/.test(input.receivedAt))
    ? input.receivedAt
    : new Date().toISOString().slice(0, 10);
  await db.from('acc_documents').update({ doc_date: `${bizDate}T12:00:00.000Z` }).eq('id', doc.id);

  await confirmDocument(doc.id, input.confirmedBy);

  const { data: order } = doc.order_id
    ? await db.from('orders').select('id, order_number, customer_id, channel_code, total_price').eq('id', doc.order_id).single()
    : { data: null };

  // Сторно комісії маркетплейсу — пропорція від проведеної. Площадка не знає
  // про повернення (mp_unaware) → комісію вона не поверне, нічого не сторнуємо.
  let commission = 0;
  if (order && order.channel_code && MARKETPLACE_CHANNELS.has(order.channel_code)) {
    const { data: feeRows } = await db
      .from('money_entries')
      .select('amount, meta')
      .eq('order_id', order.id)
      .eq('account_type', 'marketplace_fee')
      .eq('counterparty_id', order.channel_code)
      .eq('doc_type', 'commission')
      .limit(1000);
    // Сервісні збори (Rozetka Smart / «дешева доставка») площадки не повертають
    const postedNet = (feeRows ?? [])
      .filter(r => { const m = r.meta as Record<string, unknown> | null; return !m?.smart && !m?.kind; })
      .reduce((s, r) => s + Number(r.amount), 0);
    commission = commissionToReverse({
      postedNet, returnedTotal: total, orderTotal: Number(order.total_price) || 0, mpUnaware: !!meta?.mp_unaware,
    });
    if (commission > 0) {
      await reverseMarketplaceCommission({
        orderId: order.id, docId: doc.id, amount: commission, marketplace: order.channel_code,
        businessDate: bizDate, createdBy: input.confirmedBy,
        idempotencyKey: `commission-return:${doc.id}:${order.channel_code}`,
      });
    }
  }

  // Повернення коштів покупцю: DR customer(дебітор) / CR bank|cash
  let refunded = 0;
  if (refund && total > 0) {
    const party = await resolveSaleDebitParty(db, { customer_id: doc.customer_id, order_id: doc.order_id });
    await recordTxn({
      debitAccount: 'customer', debitParty: party,
      creditAccount: refund.method === 'cash' ? 'cash' : 'bank',
      amount: total, businessDate: bizDate, docId: doc.id, docType: 'refund',
      orderId: doc.order_id ?? undefined,
      description: `Повернення коштів покупцю${order ? ` (замовлення #${order.order_number})` : ''}`,
      idempotencyKey: `refund:${doc.id}`, createdBy: input.confirmedBy,
    });
    refunded = total;
  }

  await patchReturnMeta(db, doc.id, {
    kind: 'customer', stage: 'received', received_at: new Date().toISOString(),
    refund, commission_reversed: commission, refunded,
  });

  return { doc_number: doc.doc_number, total, commission_reversed: commission, refunded };
}

// ── ПП: повернення постачальнику ─────────────────────────────────────────────

export type SupplierReturnBasis =
  | { kind: 'customer_return'; docId: string }
  | { kind: 'receipt'; docId: string }
  | { kind: 'stock'; warehouseId: number };

export type CreateSupplierReturnInput = {
  basis: SupplierReturnBasis;
  supplierId: number;
  lines: Array<{ sku: string; qty: number }>;
  reason: ReturnReason;
  reasonText?: string | null;
  ttn?: string | null;
  createdBy: string;
  meta?: Record<string, unknown>;
};

/** Скільки з ПВ ще не поїхало постачальнику (по SKU, для вказаного постачальника). */
async function supplierReturnableFromCustomerReturn(db: Db, pv: AccDocumentWithLines, supplierId: number | null) {
  const { data: children } = await db
    .from('acc_documents')
    .select('id')
    .eq('parent_doc_id', pv.id).eq('doc_type', 'supplier_return')
    .neq('status', 'cancelled').is('reversal_of', null)
    .limit(100);
  const childIds = (children ?? []).map(c => c.id as string);
  const sent = childIds.length
    ? ((await db.from('acc_document_lines').select('sku, qty').in('document_id', childIds).limit(1000)).data ?? [])
    : [];
  const own = pv.lines.filter(l => supplierId == null || l.supplier_id == null || l.supplier_id === supplierId);
  return {
    available: returnableBySku(own.map(l => ({ sku: l.sku, qty: Number(l.qty) })), sent.map(l => ({ sku: l.sku, qty: Number(l.qty) }))),
    cost: new Map(own.map(l => [l.sku, Number(l.cost_price ?? 0)])),
  };
}

export async function createSupplierReturn(input: CreateSupplierReturnInput): Promise<{ id: string; doc_number: string; total: number }> {
  const db = createTypedServiceClient();
  const lines = input.lines.filter(l => Number(l.qty) > 0).map(l => ({ sku: l.sku, qty: Number(l.qty) }));
  if (!lines.length) throw new Error('Не обрано позицій');
  if (!input.supplierId) throw new Error('Не вказано постачальника');

  let warehouseId: number;
  let parentDocId: string | null = null;
  let orderId: string | null = null;
  let available: Map<string, number>;
  let cost: Map<string, number>;
  let basisLabel = '';

  if (input.basis.kind === 'customer_return') {
    const pv = await getDocument(input.basis.docId);
    if (!pv || pv.doc_type !== 'return_in') throw new Error('Підстава не є поверненням від покупця');
    if (pv.status !== 'confirmed') throw new Error('Спочатку проведіть повернення від покупця (товар отримано)');
    warehouseId = pv.warehouse_id;
    parentDocId = pv.id;
    orderId = pv.order_id;
    ({ available, cost } = await supplierReturnableFromCustomerReturn(db, pv, input.supplierId));
    basisLabel = `на підставі ${pv.doc_number}`;
  } else if (input.basis.kind === 'receipt') {
    const receipt = await getDocument(input.basis.docId);
    if (!receipt || !['receipt', 'stock_in'].includes(receipt.doc_type)) throw new Error('Прихід не знайдено');
    if (receipt.status !== 'confirmed') throw new Error('Можна повертати тільки проведені приходи');
    if (receipt.supplier_id && receipt.supplier_id !== input.supplierId) throw new Error('Постачальник не збігається з приходом');
    warehouseId = receipt.warehouse_id;
    parentDocId = receipt.id;
    const { data: prior } = await db
      .from('acc_documents').select('id')
      .eq('parent_doc_id', receipt.id).eq('doc_type', 'supplier_return')
      .neq('status', 'cancelled').is('reversal_of', null).limit(100);
    const priorIds = (prior ?? []).map(d => d.id as string);
    const priorLines = priorIds.length
      ? ((await db.from('acc_document_lines').select('sku, qty').in('document_id', priorIds).limit(1000)).data ?? [])
      : [];
    available = returnableBySku(receipt.lines.map(l => ({ sku: l.sku, qty: Number(l.qty) })), priorLines.map(l => ({ sku: l.sku, qty: Number(l.qty) })));
    cost = new Map(receipt.lines.map(l => [l.sku, Number(l.cost_price ?? 0)]));
    basisLabel = `по приходу ${receipt.doc_number}`;
  } else {
    warehouseId = input.basis.warehouseId;
    // Зі складу: межа — залишок партій цього постачальника, ціна — середня по них
    const { data: batches } = await db
      .from('stock_batches')
      .select('sku, remaining_qty, cost_price')
      .eq('warehouse_id', warehouseId).eq('supplier_id', input.supplierId)
      .in('sku', lines.map(l => l.sku)).gt('remaining_qty', 0)
      .limit(1000);
    const qtyBy = new Map<string, number>(); const costBy = new Map<string, number>();
    for (const b of batches ?? []) {
      qtyBy.set(b.sku, (qtyBy.get(b.sku) ?? 0) + Number(b.remaining_qty));
      costBy.set(b.sku, (costBy.get(b.sku) ?? 0) + Number(b.remaining_qty) * Number(b.cost_price));
    }
    available = new Map([...qtyBy].map(([sku, q]) => [sku, q]));
    cost = new Map([...qtyBy].map(([sku, q]) => [sku, q > 0 ? round2((costBy.get(sku) ?? 0) / q) : 0]));
    basisLabel = 'зі складу';
  }

  const err = validateRequestedQty(lines, available);
  if (err) throw new Error(err);

  // Товар має фізично бути на складі (повернений покупцем могли вже продати)
  for (const l of lines) {
    const { data: bal } = await db.from('stock_balance').select('qty_available')
      .eq('sku', l.sku).eq('warehouse_id', warehouseId).maybeSingle();
    const avail = Number(bal?.qty_available ?? 0);
    if (avail + 1e-9 < l.qty) throw new Error(`${l.sku}: на складі доступно ${avail}, а повернути хочемо ${l.qty}`);
  }

  const returnMeta: ReturnMeta = {
    kind: 'supplier', stage: 'sent', reason: input.reason,
    reason_text: input.reasonText?.trim() || null,
    ttn: input.ttn?.trim() || null,
    sent_at: new Date().toISOString(),
  };

  const doc = await createDocument({
    doc_type:      'supplier_return',
    warehouse_id:  warehouseId,
    supplier_id:   input.supplierId,
    parent_doc_id: parentDocId ?? undefined,
    tracking_number: returnMeta.ttn ?? undefined,
    notes:         `Повернення постачальнику ${basisLabel}${returnMeta.reason_text ? ` — ${returnMeta.reason_text}` : ''}`,
    created_by:    input.createdBy,
    meta:          { ...(input.meta ?? {}), return: { ...returnMeta, order_id: orderId } },
    lines: lines.map(l => ({
      sku: l.sku, qty: l.qty, price: 0, cost_price: cost.get(l.sku) ?? 0,
      fulfillment_type: 'own' as const, warehouse_id: warehouseId, supplier_id: input.supplierId,
    })),
  });

  await confirmDocument(doc.id, input.createdBy);
  const total = round2(lines.reduce((s, l) => s + l.qty * (cost.get(l.sku) ?? 0), 0));
  return { id: doc.id, doc_number: doc.doc_number, total };
}

export async function acceptSupplierReturn(docId: string, acceptedAt: string | null | undefined): Promise<void> {
  const db = createTypedServiceClient();
  const { data: doc } = await db.from('acc_documents').select('id, doc_type, status, meta').eq('id', docId).single();
  if (!doc || doc.doc_type !== 'supplier_return') throw new Error('Це не повернення постачальнику');
  if (doc.status !== 'confirmed') throw new Error('Документ не проведено');
  const at = acceptedAt && /^\d{4}-\d{2}-\d{2}$/.test(acceptedAt) ? `${acceptedAt}T12:00:00.000Z` : new Date().toISOString();
  await patchReturnMeta(db, docId, { kind: 'supplier', stage: 'accepted', accepted_at: at });
}

export async function updateReturnDetails(docId: string, patch: { ttn?: string | null; reason?: ReturnReason; reason_text?: string | null }): Promise<void> {
  const db = createTypedServiceClient();
  const { data: doc } = await db.from('acc_documents').select('id, doc_type, status').eq('id', docId).single();
  if (!doc || !RETURN_TYPES.includes(doc.doc_type)) throw new Error('Документ не є поверненням');
  if (doc.status === 'cancelled') throw new Error('Документ скасовано');
  const metaPatch: Partial<ReturnMeta> = {};
  if (patch.ttn !== undefined) metaPatch.ttn = patch.ttn?.trim() || null;
  if (patch.reason) metaPatch.reason = patch.reason;
  if (patch.reason_text !== undefined) metaPatch.reason_text = patch.reason_text?.trim() || null;
  await patchReturnMeta(db, docId, metaPatch);
  if (patch.ttn !== undefined) await db.from('acc_documents').update({ tracking_number: patch.ttn?.trim() || null }).eq('id', docId);
}

// ── Скасування ───────────────────────────────────────────────────────────────

export async function cancelReturn(docId: string, reason: string | null, cancelledBy: string): Promise<void> {
  const db = createTypedServiceClient();
  const doc = await getDocument(docId);
  if (!doc || !RETURN_TYPES.includes(doc.doc_type)) throw new Error('Документ не є поверненням');
  if (doc.status === 'cancelled') throw new Error('Документ уже скасовано');
  const meta = metaOf(doc);

  if (doc.doc_type === 'return_in') {
    const { data: children } = await db
      .from('acc_documents').select('doc_number')
      .eq('parent_doc_id', doc.id).eq('doc_type', 'supplier_return').neq('status', 'cancelled').limit(20);
    if (children?.length) {
      throw new Error(`Спочатку скасуйте повернення постачальнику: ${children.map(c => c.doc_number).join(', ')}`);
    }
  }

  const wasConfirmed = doc.status === 'confirmed';
  await cancelDocument(docId, cancelledBy, reason ?? undefined);

  if (doc.doc_type === 'return_in' && wasConfirmed) {
    const today = new Date().toISOString().slice(0, 10);
    // Комісію площадки повертаємо назад у витрати
    const commission = Number(meta?.commission_reversed ?? 0);
    if (commission > 0 && doc.channel_code) {
      await recordTxn({
        debitAccount: 'marketplace_fee', debitParty: doc.channel_code,
        creditAccount: 'marketplace_balance', creditParty: doc.channel_code,
        amount: commission, businessDate: today, docId: doc.id, docType: 'commission_return',
        orderId: doc.order_id ?? undefined,
        description: `Сторно повернення ${doc.doc_number}: комісія ${doc.channel_code} знову нарахована`,
        idempotencyKey: `commission-return-storno:${doc.id}`, createdBy: cancelledBy,
        meta: { marketplace: doc.channel_code, reversal_cancel: true },
      });
    }
    // Повернуті кошти — назад на рахунок (борг покупця відновлюється)
    const refunded = Number(meta?.refunded ?? 0);
    if (refunded > 0) {
      const party = await resolveSaleDebitParty(db, { customer_id: doc.customer_id, order_id: doc.order_id });
      await recordTxn({
        debitAccount: meta?.refund?.method === 'cash' ? 'cash' : 'bank',
        creditAccount: 'customer', creditParty: party,
        amount: refunded, businessDate: today, docId: doc.id, docType: 'refund',
        orderId: doc.order_id ?? undefined,
        description: `Сторно повернення ${doc.doc_number}: повернення коштів скасовано`,
        idempotencyKey: `refund-storno:${doc.id}`, createdBy: cancelledBy,
      });
    }
  }
}

// ── Журнал ───────────────────────────────────────────────────────────────────

export type ReturnRow = {
  id: string;
  doc_number: string;
  doc_type: string;
  kind: ReturnKind;
  stage: ReturnStage;
  status: string;
  doc_date: string;
  created_at: string | null;
  counterparty: string;
  order_id: string | null;
  order_number: number | null;
  channel_code: string | null;
  supplier_id: number | null;
  reason: ReturnReason | null;
  reason_text: string | null;
  ttn: string | null;
  mp_unaware: boolean;
  lines_count: number;
  qty: number;
  total: number;
  parent: { id: string; doc_number: string; doc_type: string } | null;
  children: Array<{ id: string; doc_number: string; stage: ReturnStage; status: string }>;
  notes: string | null;
};

export type ReturnsKpi = {
  awaiting: { count: number; total: number };
  in_transit: { count: number; total: number };
  month: { customer_total: number; supplier_total: number; count: number };
};

type RawDoc = {
  id: string; doc_type: string; doc_number: string; status: string; doc_date: string; created_at: string | null;
  order_id: string | null; customer_id: string | null; supplier_id: number | null; counterparty: string | null;
  channel_code: string | null; parent_doc_id: string | null; notes: string | null; meta: unknown;
  created_by: string | null; confirmed_at: string | null; cancelled_at: string | null; cancelled_by: string | null; cancel_reason: string | null;
};
const RAW_COLS = 'id, doc_type, doc_number, status, doc_date, created_at, order_id, customer_id, supplier_id, counterparty, channel_code, parent_doc_id, notes, meta, created_by, confirmed_at, cancelled_at, cancelled_by, cancel_reason';

async function counterpartyLabels(db: Db, docs: RawDoc[]) {
  const orderIds = [...new Set(docs.map(d => d.order_id).filter((x): x is string => !!x))];
  const supplierIds = [...new Set(docs.map(d => d.supplier_id).filter((x): x is number => x != null))];
  const customerIds = [...new Set(docs.filter(d => !d.order_id && d.customer_id).map(d => d.customer_id as string))];
  const [orders, suppliers, customers] = await Promise.all([
    orderIds.length ? db.from('orders').select('id, order_number, contact, company, channel_code').in('id', orderIds).limit(orderIds.length) : Promise.resolve({ data: [] }),
    supplierIds.length ? db.from('suppliers').select('id, name').in('id', supplierIds).limit(supplierIds.length) : Promise.resolve({ data: [] }),
    customerIds.length ? db.from('customers').select('id, name, company').in('id', customerIds).limit(customerIds.length) : Promise.resolve({ data: [] }),
  ]);
  return {
    orders: new Map(((orders.data ?? []) as Array<{ id: string; order_number: number; contact: string; company: string | null; channel_code: string | null }>).map(o => [o.id, o])),
    suppliers: new Map(((suppliers.data ?? []) as Array<{ id: number; name: string }>).map(s => [s.id, s.name])),
    customers: new Map(((customers.data ?? []) as Array<{ id: string; name: string | null; company: string | null }>).map(c => [c.id, c.company || c.name || ''])),
  };
}

function labelFor(d: RawDoc, maps: Awaited<ReturnType<typeof counterpartyLabels>>): { counterparty: string; order_number: number | null } {
  if (d.doc_type === 'supplier_return') return { counterparty: maps.suppliers.get(d.supplier_id ?? -1) ?? d.counterparty ?? '—', order_number: null };
  const o = d.order_id ? maps.orders.get(d.order_id) : null;
  const name = o?.company || o?.contact || (d.customer_id ? maps.customers.get(d.customer_id) : null) || d.counterparty || '—';
  return { counterparty: name, order_number: o?.order_number ?? null };
}

export async function listReturns(opts: { limit?: number; from?: string | null; to?: string | null } = {}): Promise<{ rows: ReturnRow[]; kpi: ReturnsKpi }> {
  const db = createTypedServiceClient();
  let q = db.from('acc_documents').select(RAW_COLS)
    .in('doc_type', RETURN_TYPES).is('reversal_of', null)
    .order('doc_date', { ascending: false }).order('id')
    .limit(Math.min(500, Math.max(1, opts.limit ?? 200)));
  if (opts.from) q = q.gte('doc_date', `${opts.from}T00:00:00`);
  if (opts.to)   q = q.lte('doc_date', `${opts.to}T23:59:59`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const docs = (data ?? []) as RawDoc[];
  const ids = docs.map(d => d.id);

  const [{ data: lines }, { data: kids }, maps] = await Promise.all([
    ids.length ? db.from('acc_document_lines').select('document_id, sku, qty, price, cost_price').in('document_id', ids).limit(5000) : Promise.resolve({ data: [] }),
    ids.length ? db.from('acc_documents').select('id, doc_number, status, meta, doc_type, parent_doc_id').eq('doc_type', 'supplier_return').in('parent_doc_id', ids).is('reversal_of', null).limit(1000) : Promise.resolve({ data: [] }),
    counterpartyLabels(db, docs),
  ]);
  const parentIds = [...new Set(docs.filter(d => d.doc_type === 'supplier_return' && d.parent_doc_id).map(d => d.parent_doc_id as string))];
  const { data: parents } = parentIds.length
    ? await db.from('acc_documents').select('id, doc_number, doc_type').in('id', parentIds).limit(parentIds.length)
    : { data: [] };
  const parentMap = new Map(((parents ?? []) as Array<{ id: string; doc_number: string; doc_type: string }>).map(p => [p.id, p]));

  const linesBy = new Map<string, Array<{ qty: number; price: number | null; cost_price: number | null }>>();
  for (const l of (lines ?? []) as Array<{ document_id: string; qty: number; price: number | null; cost_price: number | null }>) {
    const arr = linesBy.get(l.document_id) ?? []; arr.push(l); linesBy.set(l.document_id, arr);
  }
  const kidsBy = new Map<string, ReturnRow['children']>();
  for (const k of (kids ?? []) as Array<{ id: string; doc_number: string; status: string; meta: unknown; doc_type: string; parent_doc_id: string }>) {
    const arr = kidsBy.get(k.parent_doc_id) ?? [];
    arr.push({ id: k.id, doc_number: k.doc_number, status: k.status, stage: stageOf(metaOf(k), k.doc_type, k.status) });
    kidsBy.set(k.parent_doc_id, arr);
  }

  const rows: ReturnRow[] = docs.map(d => {
    const kind = kindOf(d.doc_type);
    const meta = metaOf(d);
    const ls = linesBy.get(d.id) ?? [];
    const { counterparty, order_number } = labelFor(d, maps);
    const parent = d.parent_doc_id ? parentMap.get(d.parent_doc_id) ?? null : null;
    return {
      id: d.id, doc_number: d.doc_number, doc_type: d.doc_type, kind,
      stage: stageOf(meta, d.doc_type, d.status), status: d.status,
      doc_date: d.doc_date, created_at: d.created_at,
      counterparty, order_id: d.order_id, order_number,
      channel_code: d.channel_code, supplier_id: d.supplier_id,
      reason: meta?.reason ?? null, reason_text: meta?.reason_text ?? null, ttn: meta?.ttn ?? null,
      mp_unaware: !!meta?.mp_unaware,
      lines_count: ls.length,
      qty: ls.reduce((s, l) => s + Math.abs(Number(l.qty)), 0),
      total: returnTotal(kind, ls),
      parent, children: kidsBy.get(d.id) ?? [],
      notes: d.notes,
    };
  });

  const monthStart = new Date().toISOString().slice(0, 7);
  const kpi: ReturnsKpi = {
    awaiting:   { count: 0, total: 0 },
    in_transit: { count: 0, total: 0 },
    month:      { customer_total: 0, supplier_total: 0, count: 0 },
  };
  for (const r of rows) {
    if (r.status === 'cancelled') continue;
    if (r.kind === 'customer' && r.stage === 'awaiting') { kpi.awaiting.count++; kpi.awaiting.total = round2(kpi.awaiting.total + r.total); }
    if (r.kind === 'supplier' && r.stage === 'sent')     { kpi.in_transit.count++; kpi.in_transit.total = round2(kpi.in_transit.total + r.total); }
    if (r.doc_date.slice(0, 7) === monthStart) {
      kpi.month.count++;
      if (r.kind === 'customer') kpi.month.customer_total = round2(kpi.month.customer_total + r.total);
      else kpi.month.supplier_total = round2(kpi.month.supplier_total + r.total);
    }
  }
  return { rows, kpi };
}

// ── Картка документа ─────────────────────────────────────────────────────────

export type ReturnCardLine = {
  sku: string; name: string; qty: number; price: number; cost_price: number;
  amount: number; supplier_id: number | null; supplier_name: string | null;
  origin_fulfillment: string | null;
  /** ПВ: скільки з цього рядка ще можна відправити постачальнику */
  supplier_returnable: number | null;
};
export type ReturnEntry = {
  txn_id: string; business_date: string; description: string | null; doc_type: string | null;
  debit: { account: string; party: string | null }; credit: { account: string; party: string | null }; amount: number;
};
export type ReturnCard = ReturnRow & {
  warehouse_id: number;
  created_by: string | null;
  confirmed_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  refund: { method: RefundMethod } | null;
  commission_reversed: number;
  refunded: number;
  lines: ReturnCardLine[];
  entries: ReturnEntry[];
  chain: { sales: Array<{ id: string; doc_number: string; doc_date: string }>; parent: ReturnRow['parent']; children: ReturnRow['children'] };
  timeline: TimelineStep[];
  actions: ReturnActions;
  suppliers: Array<{ id: number; name: string }>;
  received_at: string | null;
  sent_at: string | null;
  accepted_at: string | null;
};

export async function getReturnCard(id: string): Promise<ReturnCard | null> {
  const db = createTypedServiceClient();
  const { data } = await db.from('acc_documents').select(`${RAW_COLS}, warehouse_id`).eq('id', id).maybeSingle();
  if (!data || !RETURN_TYPES.includes(data.doc_type)) return null;
  const d = data as RawDoc & { warehouse_id: number };
  const kind = kindOf(d.doc_type);
  const meta = metaOf(d);
  const stage = stageOf(meta, d.doc_type, d.status);

  const [{ data: rawLines }, { data: rawEntries }, { data: kids }, maps] = await Promise.all([
    db.from('acc_document_lines').select('id, sku, qty, price, cost_price, supplier_id, meta').eq('document_id', id).order('sort_order').order('id'),
    db.from('money_entries').select('txn_id, account_type, counterparty_id, amount, business_date, description, doc_type, created_at').eq('doc_id', id).order('created_at').limit(200),
    db.from('acc_documents').select('id, doc_number, status, meta, doc_type').eq('parent_doc_id', id).eq('doc_type', 'supplier_return').is('reversal_of', null).order('doc_date').limit(100),
    counterpartyLabels(db, [d]),
  ]);
  const lines = (rawLines ?? []) as Array<{ id: number; sku: string; qty: number; price: number | null; cost_price: number | null; supplier_id: number | null; meta: unknown }>;
  const names = await productNames(db, lines.map(l => l.sku));

  const children: ReturnRow['children'] = ((kids ?? []) as Array<{ id: string; doc_number: string; status: string; meta: unknown; doc_type: string }>)
    .map(k => ({ id: k.id, doc_number: k.doc_number, status: k.status, stage: stageOf(metaOf(k), k.doc_type, k.status) }));

  // ПВ: скільки ще можна відправити постачальнику (по всіх дітях, без фільтра постачальника)
  let supplierReturnable = new Map<string, number>();
  if (kind === 'customer' && d.status === 'confirmed') {
    const activeKids = children.filter(c => c.status !== 'cancelled').map(c => c.id);
    const sent = activeKids.length
      ? ((await db.from('acc_document_lines').select('sku, qty').in('document_id', activeKids).limit(1000)).data ?? [])
      : [];
    supplierReturnable = returnableBySku(lines.map(l => ({ sku: l.sku, qty: Number(l.qty) })), sent.map(l => ({ sku: l.sku, qty: Number(l.qty) })));
  }

  // Постачальники для ПП: з рядків документа; для власного товару без
  // постачальника в рядку — з партій на складі, інакше всі активні.
  const supplierIds = [...new Set([d.supplier_id, ...lines.map(l => l.supplier_id)].filter((x): x is number => x != null))];
  if (kind === 'customer' && !supplierIds.length && lines.length) {
    const { data: batches } = await db.from('stock_batches').select('supplier_id')
      .eq('warehouse_id', d.warehouse_id).in('sku', lines.map(l => l.sku)).gt('remaining_qty', 0).not('supplier_id', 'is', null).limit(200);
    for (const b of batches ?? []) if (b.supplier_id != null) supplierIds.push(b.supplier_id as number);
  }
  const { data: sups } = supplierIds.length
    ? await db.from('suppliers').select('id, name').in('id', [...new Set(supplierIds)]).limit(100)
    : kind === 'customer'
      ? await db.from('suppliers').select('id, name').eq('is_active', true).order('priority').order('id').limit(50)
      : { data: [] };
  const supplierOptions = ((sups ?? []) as Array<{ id: number; name: string }>);
  const supplierMap = new Map(supplierOptions.map(s => [s.id, s.name]));

  const cardLines: ReturnCardLine[] = lines.map(l => {
    const qty = Math.abs(Number(l.qty));
    const price = Number(l.price ?? 0), cost = Number(l.cost_price ?? 0);
    return {
      sku: l.sku, name: names.get(l.sku) ?? l.sku, qty, price, cost_price: cost,
      amount: round2(qty * (kind === 'customer' ? price : cost)),
      supplier_id: l.supplier_id, supplier_name: l.supplier_id != null ? supplierMap.get(l.supplier_id) ?? null : null,
      origin_fulfillment: ((l.meta as Record<string, unknown> | null)?.origin_fulfillment as string | undefined) ?? null,
      supplier_returnable: kind === 'customer' ? (supplierReturnable.get(l.sku) ?? 0) : null,
    };
  });

  // Проводки: дві ноги однієї txn → Дт / Кт
  const byTxn = new Map<string, ReturnEntry>();
  for (const e of (rawEntries ?? []) as Array<{ txn_id: string; account_type: string; counterparty_id: string | null; amount: number; business_date: string; description: string | null; doc_type: string | null }>) {
    const cur = byTxn.get(e.txn_id) ?? { txn_id: e.txn_id, business_date: e.business_date, description: e.description, doc_type: e.doc_type, debit: { account: '', party: null }, credit: { account: '', party: null }, amount: 0 };
    if (Number(e.amount) >= 0) { cur.debit = { account: e.account_type, party: e.counterparty_id }; cur.amount = round2(Number(e.amount)); }
    else cur.credit = { account: e.account_type, party: e.counterparty_id };
    byTxn.set(e.txn_id, cur);
  }

  const { data: sales } = d.order_id
    ? await db.from('acc_documents').select('id, doc_number, doc_date').eq('order_id', d.order_id).eq('doc_type', 'sale').eq('status', 'confirmed').is('reversal_of', null).order('doc_date').limit(20)
    : { data: [] };
  const parent = d.parent_doc_id
    ? (await db.from('acc_documents').select('id, doc_number, doc_type').eq('id', d.parent_doc_id).maybeSingle()).data ?? null
    : null;

  const { counterparty, order_number } = labelFor(d, maps);
  const totalSupplierReturnable = [...supplierReturnable.values()].reduce((s, q) => s + q, 0);
  const actions = actionsFor({
    kind, stage, status: d.status,
    supplierReturnableQty: totalSupplierReturnable,
    hasActiveChildren: children.some(c => c.status !== 'cancelled'),
  });

  return {
    id: d.id, doc_number: d.doc_number, doc_type: d.doc_type, kind, stage, status: d.status,
    doc_date: d.doc_date, created_at: d.created_at, counterparty, order_id: d.order_id, order_number,
    channel_code: d.channel_code, supplier_id: d.supplier_id,
    reason: meta?.reason ?? null, reason_text: meta?.reason_text ?? null, ttn: meta?.ttn ?? null,
    mp_unaware: !!meta?.mp_unaware,
    lines_count: cardLines.length, qty: cardLines.reduce((s, l) => s + l.qty, 0),
    total: round2(cardLines.reduce((s, l) => s + l.amount, 0)),
    parent: parent as ReturnRow['parent'], children, notes: d.notes,
    warehouse_id: d.warehouse_id, created_by: d.created_by, confirmed_at: d.confirmed_at,
    cancelled_by: d.cancelled_by, cancel_reason: d.cancel_reason,
    refund: meta?.refund ?? null, commission_reversed: Number(meta?.commission_reversed ?? 0), refunded: Number(meta?.refunded ?? 0),
    lines: cardLines, entries: [...byTxn.values()],
    chain: { sales: (sales ?? []) as Array<{ id: string; doc_number: string; doc_date: string }>, parent: parent as ReturnRow['parent'], children },
    timeline: timelineFor({ kind, stage, status: d.status, createdAt: d.created_at, confirmedAt: d.confirmed_at, meta, cancelledAt: d.cancelled_at }),
    actions,
    suppliers: supplierOptions,
    received_at: meta?.received_at ?? null, sent_at: meta?.sent_at ?? null, accepted_at: meta?.accepted_at ?? null,
  };
}
