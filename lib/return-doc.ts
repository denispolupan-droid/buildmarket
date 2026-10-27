// Дані друкованих форм повернення: «Накладна на повернення товару» (ПВ і ПП)
// та «Акт повернення товару» (ПВ). Один завантажувач для PDF-роуту, щоб
// реквізити сторін і підстава не розходились між формами.
//
// Реквізити первинного документа (ЗУ «Про бухоблік», ст. 9; Положення № 88):
// назва, дата й місце складання, сторони, зміст та обсяг операції з одиницею
// виміру, підстава, посади й підписи відповідальних осіб. Для повернення
// додаємо причину — її вимагає облік руху товару, і вона потрібна при спорі.

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveVidatkovaBuyer } from './vidatkova-buyer';
import { SELLER, SELLER_SIGNER, sellerTaxStatus } from './company';
import type { Signer } from './signatory';
import { REASON_LABEL, kindOf, type ReturnKind, type ReturnMeta } from './accounting/returns-rules';
import { formatDocDate } from './doc-format';

export type ReturnPrintForm = 'nakladna' | 'akt';

export type ReturnPrintLine = { sku: string; name: string; qty: number; unit: string; price: number };

export type ReturnParty = {
  /** Підпис блоку: «Постачальник» / «Одержувач» (накладна), «Покупець» / «Продавець» (акт) */
  role: string;
  name: string;
  edrpou: string | null;
  address: string | null;
  phone: string | null;
  bank: string | null;
  iban: string | null;
  taxStatus: string | null;
  signer: Signer | null;
};

export type ReturnPrintParams = {
  form: ReturnPrintForm;
  kind: ReturnKind;
  docNumber: string;
  docDate: string;
  city: string;
  /** Хто віддає товар (у накладній — «Постачальник», в акті — «Покупець») */
  sender: ReturnParty;
  /** Хто приймає товар */
  receiver: ReturnParty;
  basis: string | null;
  orderNumber: number | null;
  reason: string | null;
  ttn: string | null;
  lines: ReturnPrintLine[];
  total: number;
  /** Акт: що з грошима (повернуто / підлягають поверненню / площадка) */
  moneyNote: string | null;
};

const DOC_TITLE: Record<string, string> = {
  sale: 'видаткова накладна', receipt: 'прибуткова накладна', stock_in: 'прибуткова накладна',
  return_in: 'повернення від покупця',
};

function ourParty(role: string, docDate: string, withBank: boolean): ReturnParty {
  return {
    role,
    name: SELLER.name,
    edrpou: SELLER.edrpou || null,
    address: SELLER.address || null,
    phone: null,
    bank: withBank ? SELLER.bank || null : null,
    iban: withBank ? SELLER.iban || null : null,
    taxStatus: sellerTaxStatus(docDate),
    signer: SELLER_SIGNER,
  };
}

export async function loadReturnPrint(db: SupabaseClient, id: string, form: ReturnPrintForm): Promise<ReturnPrintParams | null> {
  const { data: doc } = await db
    .from('acc_documents')
    .select('id, doc_number, doc_date, doc_type, status, order_id, customer_id, counterparty, supplier_id, parent_doc_id, meta, channel_code')
    .eq('id', id).maybeSingle();
  if (!doc || !['return_in', 'supplier_return'].includes(doc.doc_type)) return null;
  const kind = kindOf(doc.doc_type);
  if (form === 'akt' && kind !== 'customer') return null;

  const meta = ((doc.meta as Record<string, unknown> | null)?.return ?? null) as ReturnMeta | null;

  const { data: rawLines } = await db
    .from('acc_document_lines')
    .select('sku, qty, price, cost_price, uom_code, sort_order')
    .eq('document_id', id).order('sort_order').order('id');
  const lines = (rawLines ?? []) as Array<{ sku: string; qty: number; price: number | null; cost_price: number | null; uom_code: string | null }>;
  const skus = lines.map(l => l.sku);
  const uomCodes = [...new Set(lines.map(l => l.uom_code).filter((c): c is string => !!c))];

  const [{ data: products }, { data: uoms }, { data: parent }] = await Promise.all([
    skus.length ? db.from('products').select('sku, name, brand').in('sku', skus) : Promise.resolve({ data: [] as Array<{ sku: string; name: string; brand: string | null }> }),
    uomCodes.length ? db.from('uom').select('code, name_short').in('code', uomCodes) : Promise.resolve({ data: [] as Array<{ code: string; name_short: string }> }),
    doc.parent_doc_id ? db.from('acc_documents').select('doc_number, doc_type, doc_date').eq('id', doc.parent_doc_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const nameMap = new Map((products ?? []).map(p => [p.sku, `${p.brand ?? ''} ${p.name}`.trim()]));
  const uomMap = new Map((uoms ?? []).map(u => [u.code, u.name_short]));

  const printLines: ReturnPrintLine[] = lines.map(l => ({
    sku: l.sku,
    name: nameMap.get(l.sku) || l.sku,
    qty: Math.abs(Number(l.qty)),
    unit: (l.uom_code && uomMap.get(l.uom_code)) || 'шт.',
    price: Number((kind === 'customer' ? l.price : l.cost_price) ?? 0),
  }));
  const total = Math.round(printLines.reduce((s, l) => s + l.qty * l.price, 0) * 100) / 100;

  const basisParts: string[] = [];
  if (parent?.doc_number) {
    basisParts.push(`${DOC_TITLE[parent.doc_type as string] ?? 'документ'} № ${parent.doc_number} від ${formatDocDate(String(parent.doc_date))}`);
  }

  let sender: ReturnParty, receiver: ReturnParty, orderNumber: number | null = null;
  if (kind === 'customer') {
    const buyer = await resolveVidatkovaBuyer(db, doc);
    orderNumber = buyer.orderNumber;
    if (orderNumber) basisParts.push(`замовлення № ${orderNumber}`);
    const buyerParty: ReturnParty = {
      role: form === 'akt' ? 'Покупець' : 'Постачальник',
      name: buyer.name, edrpou: buyer.edrpou, address: buyer.address, phone: buyer.phone,
      bank: null, iban: null, taxStatus: null, signer: buyer.signer,
    };
    sender = buyerParty;
    receiver = ourParty(form === 'akt' ? 'Продавець' : 'Одержувач', doc.doc_date, form !== 'akt');
  } else {
    const { data: sup } = doc.supplier_id
      ? await db.from('suppliers').select('name, legal_name, edrpou, contact_phone, bank_name, bank_iban').eq('id', doc.supplier_id).maybeSingle()
      : { data: null };
    sender = ourParty('Постачальник', doc.doc_date, false);
    receiver = {
      role: 'Одержувач',
      name: sup?.legal_name || sup?.name || doc.counterparty || '—',
      edrpou: sup?.edrpou ?? null, address: null, phone: sup?.contact_phone ?? null,
      bank: sup?.bank_name ?? null, iban: sup?.bank_iban ?? null, taxStatus: null, signer: null,
    };
    const orderId = (meta as (ReturnMeta & { order_id?: string | null }) | null)?.order_id ?? doc.order_id;
    if (orderId) {
      const { data: o } = await db.from('orders').select('order_number').eq('id', orderId).maybeSingle();
      orderNumber = o?.order_number ?? null;
    }
  }

  const reason = meta
    ? [REASON_LABEL[meta.reason] ?? null, meta.reason_text].filter(Boolean).join(': ')
    : null;

  let moneyNote: string | null = null;
  if (form === 'akt') {
    if (meta?.refunded && meta.refunded > 0) {
      moneyNote = `Кошти за повернений товар у сумі ${total.toFixed(2).replace('.', ',')} грн повернуто покупцю ${meta.refund?.method === 'cash' ? 'готівкою' : 'на картку / рахунок'}.`;
    } else if (doc.channel_code && ['prom', 'rozetka', 'epicentr'].includes(doc.channel_code) && !meta?.mp_unaware) {
      moneyNote = 'Кошти за повернений товар покупцю повертає маркетплейс.';
    } else {
      moneyNote = `Кошти за повернений товар у сумі ${total.toFixed(2).replace('.', ',')} грн підлягають поверненню покупцю.`;
    }
  }

  return {
    form, kind,
    docNumber: doc.doc_number, docDate: doc.doc_date, city: SELLER.city,
    sender, receiver,
    basis: basisParts.length ? basisParts.join(', ') : null,
    orderNumber,
    reason: reason || null,
    ttn: meta?.ttn ?? null,
    lines: printLines, total, moneyNote,
  };
}
