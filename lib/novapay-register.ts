/**
 * Реєстр переказів НоваПей («Реєстр платежів контрагента … № N») — склад однієї
 * виплати наложки по ЕН. API НП/НоваПей складу реєстру не віддає (GetRegister →
 * APIError), зате сам файл щодня приходить листом від erp-backoffice-mailer@novapay.ua
 * (XLSX-вкладення). Це єдине надійне джерело: підбір складу за сумами
 * (matchNpRegister) плутає замовлення з однаковими сумами — 27–28.09.2026 три
 * наложки по 660 ₴ стояли не на тих замовленнях.
 *
 * Чиста частина (розбір аркуша, план проводок) — lib/novapay-register-rules.ts.
 * Тут — проведення: applyNpRegister знаходить документ виписки за номером реєстру
 * і доводить проводки np-payout/np-fee по кожній ЕН до реєстру (зайве сторнує,
 * відсутнє проводить). Рядки з номером «59…» — не ЕН, а платежі через НоваПей
 * (термінал / рахунок): їх зіставляємо за покупцем і сумою (10 600 по #26091174
 * прийшли двома платежами 5 840 + 4 760).
 */
import { createServiceClient } from './supabase';
import { recordTxn } from './accounting/money';
import { SALE_DEBTOR } from './accounting/sale-party';
import { fetchAllRows } from './db-paginate';
import { planNpRegisterApply, nextSeqKey, type NpRegister, type NpRegisterLookup } from './novapay-register-rules';

export { parseNpMoney, parseNpRegisterSheet, planNpRegisterApply, nextSeqKey } from './novapay-register-rules';
export type { NpRegister, NpRegisterRow, NpRegisterLookup, NpRegisterPlan, NpKnownOrder } from './novapay-register-rules';

const r2 = (n: number) => Math.round(n * 100) / 100;

export type NpRegisterApplyResult = {
  registerNo: string; date: string; docId: string | null; status: 'done' | 'no-doc';
  posted: { orderNumber: number; net: number }[]; undone: { orderNumber: number; net: number }[]; keep: number;
  unknown: { ttn: string; gross: number; buyer: string }[]; aggregateRest: number;
};

type Db = ReturnType<typeof createServiceClient>;

/**
 * Проводка з ключем; якщо ключ уже зайнятий — наступний суфікс (:2, :3 …), як у
 * rzpay-register-apply. Вільний суфікс шукаємо по існуючих ключах: RPC record_money_txn
 * при зайнятому ключі не кидає помилку, а мовчки повертає старий txn_id (див. nextSeqKey),
 * тому «спробувати і зловити дубль» тут не працювало і проводка губилась.
 */
async function postWithSeq(base: string, input: Omit<Parameters<typeof recordTxn>[0], 'idempotencyKey'>): Promise<string> {
  const db = createServiceClient();
  const { data: rows, error } = await db
    .from('money_entries').select('idempotency_key')
    .or(`idempotency_key.eq.${base},idempotency_key.like.${base}:%`)
    .order('id').limit(50);
  if (error) throw new Error(`ключі ${base}: ${error.message}`);
  const key = nextSeqKey(base, (rows ?? []).map(r => String(r.idempotency_key)));
  return recordTxn({ ...input, idempotencyKey: key });
}

type O = { id: string; order_number: number; tracking_number: string | null; contact: string | null; total_price: number; delivered_at: string | null; created_at: string; payment_type: string | null; status: string };
const SEL = 'id, order_number, tracking_number, contact, total_price, delivered_at, created_at, payment_type, status';

/** Наше замовлення для рядка реєстру: за ЕН, за нашим номером у «Номер замовлення», для платежів НоваПей — за прізвищем покупця і сумою. */
export async function buildNpRegisterLookup(db: Db, reg: NpRegister): Promise<NpRegisterLookup> {
  const ttns = reg.rows.filter(r => !r.isNpPayment).map(r => r.ttn);
  const refs = reg.rows.map(r => r.orderRef).filter((x): x is string => !!x && /^\d{8}$/.test(x)).map(Number);
  const [byTtn, byRef] = await Promise.all([
    ttns.length ? db.from('orders').select(SEL).in('tracking_number', ttns).limit(ttns.length * 3) : Promise.resolve({ data: [] as O[] }),
    refs.length ? db.from('orders').select(SEL).in('order_number', refs).limit(refs.length) : Promise.resolve({ data: [] as O[] }),
  ]);
  // Одна ЕН може стояти на двох замовленнях (скасоване + перевиписане): беремо не скасоване, потім свіжіше
  const ttnMap = new Map<string, O>();
  const ranked = ((byTtn.data ?? []) as O[]).sort((a, b) => (a.status === 'cancelled' ? 1 : 0) - (b.status === 'cancelled' ? 1 : 0) || b.created_at.localeCompare(a.created_at));
  for (const o of ranked) { const k = String(o.tracking_number).replace(/\s/g, ''); if (!ttnMap.has(k)) ttnMap.set(k, o); }
  const refMap = new Map(((byRef.data ?? []) as O[]).map(o => [String(o.order_number), o]));
  // Платежі НоваПей: замовлення-наложки за прізвищем покупця за останні 60 днів
  let byName: O[] = [];
  if (reg.rows.some(r => r.isNpPayment)) {
    const since = new Date(Date.now() - 60 * 86400000).toISOString();
    byName = await fetchAllRows<O>((f, t) => db.from('orders').select(SEL).eq('payment_type', 'cod').neq('status', 'cancelled').gte('created_at', since).order('id').range(f, t));
  }
  const surname = (s: string) => s.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  return (row) => {
    if (row.orderRef && refMap.has(row.orderRef)) { const o = refMap.get(row.orderRef)!; return { id: o.id, order_number: o.order_number }; }
    if (!row.isNpPayment) { const o = ttnMap.get(row.ttn); return o ? { id: o.id, order_number: o.order_number } : null; }
    const cand = byName.filter(o => o.contact && surname(o.contact) === surname(row.buyer) && Number(o.total_price) + 0.005 >= row.gross);
    if (!cand.length) return null;
    const exact = cand.find(o => Math.abs(Number(o.total_price) - row.gross) < 0.005);
    const o = exact ?? cand.sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    return { id: o.id, order_number: o.order_number };
  };
}

/**
 * Довести проводки виплати до реєстру. Документ виписки шукаємо за номером
 * реєстру (novapay_txns.register_no); якщо виписка ще не підтягнута — 'no-doc',
 * лист лишається необробленим до наступного прогону.
 */
export async function applyNpRegister(reg: NpRegister, createdBy: string, opts: { dryRun?: boolean } = {}): Promise<NpRegisterApplyResult> {
  const db = createServiceClient();
  const dry = !!opts.dryRun;
  const res: NpRegisterApplyResult = { registerNo: reg.registerNo, date: reg.date, docId: null, status: 'no-doc', posted: [], undone: [], keep: 0, unknown: [], aggregateRest: 0 };
  const { data: doc } = await db.from('novapay_txns').select('id, txn_date, amount, status, category').eq('register_no', reg.registerNo).eq('kind', 'cod_payout').maybeSingle();
  if (!doc) return res;
  res.docId = String(doc.id); res.status = 'done';
  const docId = String(doc.id); const date = String(doc.txn_date);
  const { data: feeRow } = await db.from('app_settings').select('value').eq('key', 'np_cod_fee_pct').maybeSingle();
  const feeParsed = parseFloat(String(feeRow?.value ?? ''));
  const feePct = Number.isFinite(feeParsed) && feeParsed >= 0 ? feeParsed : 0.5;

  // Що вже проведено на цей документ: по замовленнях і сумою
  const keyed = await fetchAllRows<{ idempotency_key: string; amount: number; order_id: string | null }>((f, t) => db
    .from('money_entries').select('idempotency_key, amount, order_id')
    .or(`idempotency_key.like.np-payout:${docId}:%,idempotency_key.like.np-payout-undo:${docId}:%,idempotency_key.like.np-payout-agg-undo:${docId}%,idempotency_key.eq.np-payout:${docId},idempotency_key.eq.np-payout-undo:${docId}`)
    .order('id').range(f, t));
  const existingNet: Record<string, number> = {};
  let aggNet = 0;
  for (const r of keyed) {
    const k = r.idempotency_key; const amt = Math.abs(Number(r.amount));
    if (/^np-payout:[^:]+:agg/.test(k) || k === `np-payout:${docId}`) aggNet += amt;
    else if (k.startsWith('np-payout-agg-undo:') || k === `np-payout-undo:${docId}`) aggNet -= amt;
    else if (k.startsWith('np-payout-undo:') && r.order_id) existingNet[r.order_id] = r2((existingNet[r.order_id] ?? 0) - amt);
    else if (k.startsWith('np-payout:') && r.order_id) existingNet[r.order_id] = r2((existingNet[r.order_id] ?? 0) + amt);
  }
  aggNet = r2(aggNet);

  const lookup = await buildNpRegisterLookup(db, reg);
  const plan = planNpRegisterApply(reg, lookup, existingNet);
  res.keep = plan.keep;
  res.unknown = plan.unknown.map(u => ({ ttn: u.ttn, gross: u.gross, buyer: u.buyer }));
  const restNet = r2(plan.unknown.reduce((s, u) => s + u.net, 0));
  // Сумою вже стоїть рівно те, що лишається невідомим, і по замовленнях нічого міняти — нічого не робимо
  if (!plan.post.length && !plan.undo.length && Math.abs(aggNet - restNet) <= 0.02) return res;

  const numberOf = async (orderId: string) => (await db.from('orders').select('order_number').eq('id', orderId).maybeSingle()).data?.order_number ?? 0;

  for (const u of plan.undo) {
    const n = await numberOf(u.orderId);
    res.undone.push({ orderNumber: n, net: u.net });
    if (dry) continue;
    await postWithSeq(`np-payout-undo:${docId}:${u.orderId}`, { debitAccount: 'customer', debitParty: SALE_DEBTOR.npCod, creditAccount: 'novapay', amount: u.net, businessDate: date, docType: 'payment', orderId: u.orderId,
      description: `Сторно: #${n} не входить у реєстр № ${reg.registerNo} (реєстр з пошти)`, createdBy, meta: { novapay_doc_id: docId, storno: true, source: 'np-register-mail' } });
    const { data: fees } = await db.from('money_entries').select('amount').eq('order_id', u.orderId).like('idempotency_key', `np-fee:${docId}:${u.orderId}%`).limit(5);
    const feeSum = r2((fees ?? []).reduce((s, f) => s + Math.abs(Number(f.amount)), 0));
    if (feeSum > 0) await postWithSeq(`np-fee-undo:${docId}:${u.orderId}`, { debitAccount: 'customer', debitParty: SALE_DEBTOR.npCod, creditAccount: 'logistics', creditParty: 'np', amount: feeSum, businessDate: date, docType: 'np_fee', orderId: u.orderId,
      description: `Сторно комісії НоваПей: #${n} не входить у реєстр № ${reg.registerNo}`, createdBy, meta: { novapay_doc_id: docId, storno: true, source: 'np-register-mail' } });
  }
  // Проводка сумою заважає — сторнуємо її повністю, далі по ЕН (+ залишок невідомих знову сумою)
  if (!dry && aggNet > 0.005 && (plan.post.length || Math.abs(aggNet - restNet) > 0.02)) {
    await postWithSeq(`np-payout-agg-undo:${docId}`, { debitAccount: 'customer', debitParty: SALE_DEBTOR.npCod, creditAccount: 'novapay', amount: aggNet, businessDate: date, docType: 'payment',
      description: `Сторно виплати сумою (документ ${docId}) — переведено на облік по ЕН за реєстром № ${reg.registerNo}`, createdBy, meta: { novapay_doc_id: docId, storno: true, source: 'np-register-mail' } });
    aggNet = 0;
  }
  for (const p of plan.post) {
    res.posted.push({ orderNumber: p.orderNumber, net: p.net });
    if (dry) continue;
    const fee = r2(p.gross - p.net);
    await postWithSeq(`np-payout:${docId}:${p.orderId}`, { debitAccount: 'novapay', debitParty: null, creditAccount: 'customer', creditParty: SALE_DEBTOR.npCod, amount: p.net, businessDate: date, docType: 'payment', orderId: p.orderId,
      description: `Виплата наложки НоваПей (реєстр № ${reg.registerNo}, замовлення #${p.orderNumber})`, createdBy, meta: { novapay_doc_id: docId, register_no: reg.registerNo, gross: p.gross, fee_pct: feePct, ttn: p.ttn, source: 'np-register-mail' } });
    if (fee > 0) await postWithSeq(`np-fee:${docId}:${p.orderId}`, { debitAccount: 'logistics', debitParty: 'np', creditAccount: 'customer', creditParty: SALE_DEBTOR.npCod, amount: fee, businessDate: date, docType: 'np_fee', orderId: p.orderId,
      description: `Комісія НоваПей ${feePct}% за виплату наложки (замовлення #${p.orderNumber})`, createdBy, meta: { novapay_doc_id: docId, register_no: reg.registerNo, fee_pct: feePct, source: 'np-register-mail' } });
  }
  if (!dry && restNet > 0.005 && Math.abs(aggNet - restNet) > 0.02) {
    await postWithSeq(`np-payout:${docId}:agg-rest`, { debitAccount: 'novapay', debitParty: null, creditAccount: 'customer', creditParty: SALE_DEBTOR.npCod, amount: restNet, businessDate: date, docType: 'payment',
      description: `Виплата наложки НоваПей за реєстром № ${reg.registerNo} — рядки без нашого замовлення (${plan.unknown.map(u => u.ttn).join(', ')})`, createdBy, meta: { novapay_doc_id: docId, aggregate: true, source: 'np-register-mail' } });
    res.aggregateRest = restNet;
  }
  if (!dry) {
    const known = [...new Set(reg.rows.map(r => lookup(r)?.order_number).filter((n): n is number => !!n))];
    await db.from('novapay_txns').update({
      status: 'posted', category: known.length ? 'cod_payout' : 'cod_payout_aggregate', posted_by: createdBy, posted_at: new Date().toISOString(),
      note: `Реєстр з пошти № ${reg.registerNo}: ${known.map(n => '#' + n).join(', ') || '—'}${plan.unknown.length ? `; без замовлення: ${plan.unknown.map(u => `${u.ttn} ${u.gross} ₴ ${u.buyer}`).join(', ')}` : ''}`,
    }).eq('id', docId);
  }
  return res;
}
