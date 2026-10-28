// Дропшип «в дорозі» по постачальнику: відвантажені, ще не вручені посилки
// (РН-чернетки з dropship-рядками). Борг за ними в леджері вже є — з міграції 103
// він виникає при відвантаженні (syncDropshipPayable); тут лише розшифровка, яка
// частина боргу ще їде і скільки з неї вже оплачено.
//
// Перенесено з екрана «Кредиторка» (прибраний 28.10.2026) у «Взаєморозрахунки».
// Групування дзеркалить syncDropshipPayable: постачальник = line.supplier_id,
// інакше — мапінг SKU.

import { createServiceClient } from '../supabase';
import { fetchAllRows } from '../db-paginate';

export type TransitItem = {
  docId:          string;
  docNumber:      string | null;
  docDate:        string;
  orderNumber:    number | null;
  trackingNumber: string | null;
  /** Собівартість посилки за цим постачальником, ₴ */
  amount:         number;
  /** Скільки з неї вже оплачено постачальнику (рознесенням на борг цієї РН) */
  paid:           number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function chunks<T>(arr: T[], size = 200): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function supplierInTransit(supplierId: number): Promise<TransitItem[]> {
  const db = createServiceClient();

  const draftDocs = await fetchAllRows<{ id: string; order_id: string | null; doc_number: string | null; doc_date: string | null; tracking_number: string | null }>((f, t) => db
    .from('acc_documents')
    .select('id, order_id, doc_number, doc_date, tracking_number')
    .eq('doc_type', 'sale')
    .eq('status', 'draft')
    .order('id')
    .range(f, t));
  if (!draftDocs.length) return [];

  type Line = { document_id: string; sku: string; qty: number; cost_price: number | null; fulfillment_type: string | null; supplier_id: number | null };
  const lines: Line[] = [];
  for (const ids of chunks(draftDocs.map(d => d.id))) {
    const part = await fetchAllRows<Line>((f, t) => db.from('acc_document_lines')
      .select('document_id, sku, qty, cost_price, fulfillment_type, supplier_id')
      .in('document_id', ids)
      .eq('fulfillment_type', 'dropship')
      .order('id').range(f, t));
    lines.push(...part);
  }

  const unmapped = [...new Set(lines.filter(l => !l.supplier_id).map(l => l.sku))];
  const supplierBySku = new Map<string, number>();
  for (const skus of chunks(unmapped)) {
    const { data } = await db.from('supplier_sku_map').select('our_sku, supplier_id').in('our_sku', skus).limit(skus.length * 5);
    for (const r of data ?? []) if (!supplierBySku.has(r.our_sku as string)) supplierBySku.set(r.our_sku as string, r.supplier_id as number);
  }

  const amountByDoc = new Map<string, number>();
  for (const l of lines) {
    const sid = l.supplier_id ?? supplierBySku.get(l.sku) ?? null;
    const cost = Number(l.cost_price ?? 0) * Number(l.qty);
    if (sid !== supplierId || cost <= 0) continue;
    amountByDoc.set(l.document_id, (amountByDoc.get(l.document_id) ?? 0) + cost);
  }
  if (!amountByDoc.size) return [];

  // Оплачене: рознесення оплат на борг цього постачальника по цих РН
  const docIds = [...amountByDoc.keys()];
  const chargeDoc = new Map<string, string>();
  for (const ids of chunks(docIds)) {
    const { data } = await db.from('money_entries').select('id, doc_id')
      .eq('account_type', 'supplier').eq('counterparty_id', String(supplierId))
      .lt('amount', 0).in('doc_id', ids).limit(ids.length * 4);
    for (const e of data ?? []) chargeDoc.set(e.id as string, e.doc_id as string);
  }
  const paidByDoc = new Map<string, number>();
  for (const ids of chunks([...chargeDoc.keys()])) {
    const allocs = await fetchAllRows<{ charge_entry_id: string; amount: number }>((f, t) => db
      .from('supplier_payment_allocations').select('charge_entry_id, amount')
      .in('charge_entry_id', ids).order('charge_entry_id').range(f, t));
    for (const a of allocs) {
      const doc = chargeDoc.get(a.charge_entry_id)!;
      paidByDoc.set(doc, (paidByDoc.get(doc) ?? 0) + Number(a.amount));
    }
  }

  const docById = new Map(draftDocs.map(d => [d.id, d]));
  const orderIds = [...new Set(docIds.map(id => docById.get(id)?.order_id).filter(Boolean))] as string[];
  const orderNum = new Map<string, number>();
  for (const ids of chunks(orderIds)) {
    const { data } = await db.from('orders').select('id, order_number').in('id', ids).limit(ids.length);
    for (const o of data ?? []) orderNum.set(o.id as string, o.order_number as number);
  }

  return docIds
    .map(id => {
      const d = docById.get(id)!;
      const amount = round2(amountByDoc.get(id)!);
      return {
        docId:          id,
        docNumber:      d.doc_number,
        docDate:        String(d.doc_date ?? '').slice(0, 10),
        orderNumber:    d.order_id ? (orderNum.get(d.order_id) ?? null) : null,
        trackingNumber: d.tracking_number,
        amount,
        paid:           round2(Math.min(amount, paidByDoc.get(id) ?? 0)),
      };
    })
    .sort((a, b) => a.docDate.localeCompare(b.docDate));
}
