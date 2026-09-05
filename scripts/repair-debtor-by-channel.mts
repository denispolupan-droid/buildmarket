/**
 * Ремонт історії дебіторки під Варіант B («дебітор по каналу»), розбір 2026-09-05.
 *
 * Що було: продаж лягав на клієнта (customer_id), а погашення — на службову
 * сторону (збір наложки → np:cod, виплати площадок → mp:*). 194 клієнти
 * «заборгували» 152 тис., np:cod пішов у −96 тис. Плюс 4 задвоєння еквайрингу
 * (покриття з №замовлення зараховане другою оплатою) і «COD зібрано НоваПей» по
 * замовленнях, де наложку збирала Rozetka Доставка.
 *
 * Що робить (усе append-only, компенсуючими проводками, ідемпотентно за ключами):
 *   A. Перенос дебітора: по кожному замовленню залишок на «не тій» стороні
 *      (клієнт / guest / order:<id>) переноситься на сторону за новим правилом
 *      (lib/accounting/sale-party). Ключ party-repair:{orderId}:{oldParty}.
 *      Пари «COD зібрано НоваПей» у залишок не входять — їх править крок C.
 *   B. Еквайринг: matched-рядки виписки з «еквайринг» у призначенні → сторно
 *      оплати (як DELETE /payments/[id]): reversed=true, amount_paid, РКО +
 *      DR customer[сторона оплати] / CR bank. Ключ order_payment_reversal:{paymentId}.
 *      Рядок виписки → status 'acquiring' (потрібна міграція 110).
 *   C. «COD зібрано НоваПей» там, де нова сторона ≠ np:cod (наложка через Rozetka
 *      Доставка): сторно DR np:cod / CR novapay. Ключ cod-collect-repair:{orderId}.
 *
 * Запуск:
 *   npx tsx --env-file=.env.local scripts/repair-debtor-by-channel.mts                 # показати план
 *   npx tsx --env-file=.env.local scripts/repair-debtor-by-channel.mts --only 26091005 # план по одному
 *   npx tsx --env-file=.env.local scripts/repair-debtor-by-channel.mts --apply         # провести
 *   npx tsx --env-file=.env.local scripts/repair-debtor-by-channel.mts --apply --only 26091005
 *
 * Перед --apply: міграції 110/111 на prod. Бекап: scripts/.repair-debtor-backup-<час>.json
 * (усі проводки/оплати/рядки виписки, яких торкаємось). Читання — з ORDER (інцидент 30.08).
 */
import * as fs from 'node:fs';
import * as supabaseNS from '../lib/supabase';
import * as moneyNS from '../lib/accounting/money';
import * as docsNS from '../lib/accounting/documents';
import * as partyNS from '../lib/accounting/sale-party';
import * as pagNS from '../lib/db-paginate';

type Mod<T> = T & { default?: T };
const { createServiceClient } = ((supabaseNS as Mod<typeof supabaseNS>).default ?? supabaseNS);
const { recordTxn } = ((moneyNS as Mod<typeof moneyNS>).default ?? moneyNS);
const { createPaymentVoucher } = ((docsNS as Mod<typeof docsNS>).default ?? docsNS);
const { saleDebitPartyFor, isSpecialDebtor, SALE_DEBTOR, SPECIAL_DEBTOR_LABEL } = ((partyNS as Mod<typeof partyNS>).default ?? partyNS);
const { fetchAllRows } = ((pagNS as Mod<typeof pagNS>).default ?? pagNS);

const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
const onlyIdx = argv.indexOf('--only');
const only = onlyIdx >= 0 ? Number(argv[onlyIdx + 1]) : null;
const CREATED_BY = 'script:repair-debtor-by-channel';
const COD_COLLECT_PREFIX = 'COD зібрано НоваПей';

const db = createServiceClient();
const fmt = (n: number) => n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const label = (p: string) => (isSpecialDebtor(p) ? SPECIAL_DEBTOR_LABEL[p] : p.startsWith('order:') ? 'order:…' : 'клієнт');

type Entry = {
  id: string; txn_id: string; counterparty_id: string | null; amount: number; doc_type: string | null;
  order_id: string | null; description: string | null; idempotency_key: string | null; business_date: string; created_at: string;
};
type Order = {
  id: string; order_number: number; customer_id: string | null; channel_code: string | null;
  payment_type: string | null; delivery_type: string | null; status: string; total_price: number; amount_paid: number | null;
};

// ── Читання ────────────────────────────────────────────────────────────────────
const entries = await fetchAllRows<Entry>((f, t) => db
  .from('money_entries')
  .select('id, txn_id, counterparty_id, amount, doc_type, order_id, description, idempotency_key, business_date, created_at')
  .eq('account_type', 'customer')
  .order('created_at').order('id')
  .range(f, t));

const orders = await fetchAllRows<Order>((f, t) => db
  .from('orders')
  .select('id, order_number, customer_id, channel_code, payment_type, delivery_type, status, total_price, amount_paid')
  .order('created_at').order('id')
  .range(f, t));
const orderById = new Map(orders.map(o => [o.id, o]));

// order:<uuid> — псевдо-дебітор оплати гостя до прив'язки клієнта; відносимо до замовлення
const orderIdOf = (e: Entry): string | null =>
  e.order_id ?? (e.counterparty_id?.startsWith('order:') ? e.counterparty_id.slice(6) : null);

// ── Крок A: план переносів ─────────────────────────────────────────────────────
type Move = { order: Order; from: string; to: string; amount: number; businessDate: string };
const moves: Move[] = [];
const byOrder = new Map<string, Entry[]>();
for (const e of entries) {
  const oid = orderIdOf(e);
  if (!oid || !e.counterparty_id) continue;
  if (!byOrder.has(oid)) byOrder.set(oid, []);
  byOrder.get(oid)!.push(e);
}
for (const [oid, list] of byOrder) {
  const order = orderById.get(oid);
  if (!order) continue;
  if (only && order.order_number !== only) continue;
  const to = saleDebitPartyFor(order);
  const residual = new Map<string, number>();
  let firstDate = '9999-12-31';
  for (const e of list) {
    // Пари збору НоваПей і їх сторно (крок C, «Сторно «COD зібрано НоваПей»…») —
    // не залишок дебітора, а рух грошей; інакше після кроку C сторно на np:cod
    // виглядало б як борг і переносилось би на mp:rozetka вдруге (спіймано 06.09).
    if (e.description?.includes(COD_COLLECT_PREFIX) || e.idempotency_key?.startsWith('cod-collect')) continue;
    // Попередні переноси НЕ пропускаємо: обидві їх ноги входять у залишок, тож
    // після ремонту стара сторона = 0, нова = повна сума → повторний прогін нічого
    // не робить; а якщо спосіб оплати змінили після ремонту — перенесе ще раз на
    // нову сторону (ключ party-repair:{order}:{oldParty} інший).
    const p = e.counterparty_id!;
    residual.set(p, Math.round(((residual.get(p) ?? 0) + Number(e.amount)) * 100) / 100);
    if (e.doc_type === 'sale' && e.business_date < firstDate) firstDate = e.business_date;
  }
  for (const [from, amount] of residual) {
    if (from === to || Math.abs(amount) < 0.005) continue;
    // Службові сторони між собою не переносимо (крім guest/order:*) — їх правлять кроки B/C
    if (isSpecialDebtor(from) && from !== SALE_DEBTOR.guest && !(from === SALE_DEBTOR.npCod && to === SALE_DEBTOR.rozetka)) continue;
    moves.push({ order, from, to, amount, businessDate: firstDate === '9999-12-31' ? list[0].business_date : firstDate });
  }
}

// ── Крок B: задвоєний еквайринг ────────────────────────────────────────────────
const { data: acqRows } = await db
  .from('mono_bank_txns')
  .select('id, amount, comment, matched_order_id, order_payment_id, status')
  .eq('status', 'matched')
  .ilike('comment', '%еквайринг%')
  .order('txn_time');
type Reversal = { txnId: string; paymentId: string; order: Order; amount: number; party: string; paymentMode: string };
const reversals: Reversal[] = [];
for (const r of acqRows ?? []) {
  if (!r.order_payment_id || !r.matched_order_id) continue;
  const order = orderById.get(r.matched_order_id);
  if (!order || (only && order.order_number !== only)) continue;
  const { data: pay } = await db.from('order_payments').select('id, amount, payment_mode, reversed').eq('id', r.order_payment_id).maybeSingle();
  if (!pay || pay.reversed) continue;
  const orig = entries.find(e => e.idempotency_key === `order_payment:${pay.id}`)
    ?? entries.find(e => e.txn_id === (entries.find(x => x.idempotency_key === `order_payment:${pay.id}`)?.txn_id ?? ''));
  const party = orig?.counterparty_id ?? saleDebitPartyFor(order);
  reversals.push({ txnId: r.id, paymentId: pay.id, order, amount: Number(pay.amount), party, paymentMode: pay.payment_mode });
}

// ── Крок C: «COD зібрано НоваПей» не на np:cod ─────────────────────────────────
type CodFix = { order: Order; amount: number; businessDate: string };
const codFixes: CodFix[] = [];
const { data: codRows } = await db
  .from('money_entries')
  .select('order_id, amount, business_date, idempotency_key')
  .eq('account_type', 'novapay')
  .like('idempotency_key', 'cod-collect:%')
  .order('created_at');
const repaired = new Set(entries.filter(e => e.idempotency_key?.startsWith('cod-collect-repair:')).map(e => e.idempotency_key!.slice('cod-collect-repair:'.length)));
for (const r of codRows ?? []) {
  const order = r.order_id ? orderById.get(r.order_id) : null;
  if (!order || (only && order.order_number !== only)) continue;
  if (repaired.has(order.id)) continue;
  if (saleDebitPartyFor(order) === SALE_DEBTOR.npCod) continue;
  codFixes.push({ order, amount: Number(r.amount), businessDate: r.business_date });
}

// ── Звіт ───────────────────────────────────────────────────────────────────────
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
console.log(`\nA. Переноси дебітора: ${moves.length} (Σ ${fmt(sum(moves.map(m => m.amount)))} ₴)`);
const byPair = new Map<string, { n: number; s: number }>();
for (const m of moves) {
  const k = `${label(m.from)} → ${label(m.to)}`;
  const v = byPair.get(k) ?? { n: 0, s: 0 };
  byPair.set(k, { n: v.n + 1, s: v.s + m.amount });
}
for (const [k, v] of byPair) console.log(`   ${k}: ${v.n} шт, ${fmt(v.s)} ₴`);
if (only || moves.length <= 15) for (const m of moves) console.log(`   #${m.order.order_number} ${m.order.channel_code}/${m.order.payment_type}/${m.order.delivery_type}: ${fmt(m.amount)} ₴ ${m.from} → ${m.to}`);

console.log(`\nB. Сторно задвоєного еквайрингу: ${reversals.length} (Σ ${fmt(sum(reversals.map(r => r.amount)))} ₴)`);
for (const r of reversals) console.log(`   #${r.order.order_number}: ${fmt(r.amount)} ₴ (сторона ${r.party})`);

console.log(`\nC. Сторно «COD зібрано НоваПей» (наложку збирала Rozetka): ${codFixes.length} (Σ ${fmt(sum(codFixes.map(c => c.amount)))} ₴)`);
for (const c of codFixes) console.log(`   #${c.order.order_number}: ${fmt(c.amount)} ₴`);

async function specialBalances(): Promise<Record<string, number>> {
  const { data } = await db.from('counterparty_balances').select('counterparty_id, balance').eq('account_type', 'customer');
  const out: Record<string, number> = { customers_positive: 0, customers_negative: 0 };
  for (const r of data ?? []) {
    const b = Number(r.balance);
    if (isSpecialDebtor(r.counterparty_id) || r.counterparty_id.startsWith('order:')) out[r.counterparty_id] = b;
    else if (b > 0) out.customers_positive += b;
    else if (b < 0) out.customers_negative += b;
  }
  return out;
}
const before = await specialBalances();
console.log('\nБаланси ДО:', Object.fromEntries(Object.entries(before).map(([k, v]) => [k, fmt(v)])));

if (!apply) {
  console.log('\nРежим перегляду. Щоб провести: --apply (спершу міграції 110/111 на prod).');
  process.exit(0);
}

// ── Бекап ──────────────────────────────────────────────────────────────────────
const touchedOrders = new Set([...moves.map(m => m.order.id), ...reversals.map(r => r.order.id), ...codFixes.map(c => c.order.id)]);
const backup = {
  at: new Date().toISOString(),
  entries: entries.filter(e => touchedOrders.has(orderIdOf(e) ?? '')),
  orders: orders.filter(o => touchedOrders.has(o.id)),
  order_payments: reversals.length ? (await db.from('order_payments').select('*').in('id', reversals.map(r => r.paymentId))).data : [],
  mono_bank_txns: reversals.length ? (await db.from('mono_bank_txns').select('*').in('id', reversals.map(r => r.txnId))).data : [],
  plan: { moves: moves.map(m => ({ order: m.order.order_number, from: m.from, to: m.to, amount: m.amount })), reversals: reversals.map(r => ({ order: r.order.order_number, amount: r.amount })), codFixes: codFixes.map(c => ({ order: c.order.order_number, amount: c.amount })) },
};
const backupPath = `scripts/.repair-debtor-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
console.log(`\nБекап: ${backupPath}`);

// ── Проведення ─────────────────────────────────────────────────────────────────
let done = 0, skipped = 0;
const isDup = (err: unknown) => /unique|duplicate|23505/.test(String(err instanceof Error ? err.message : err));

for (const m of moves) {
  // residual > 0 (борг на старій стороні) → DR нова / CR стара; < 0 — навпаки
  const debit  = m.amount > 0 ? m.to : m.from;
  const credit = m.amount > 0 ? m.from : m.to;
  try {
    await recordTxn({
      debitAccount: 'customer', debitParty: debit, creditAccount: 'customer', creditParty: credit,
      amount: Math.abs(m.amount), businessDate: m.businessDate, docType: 'correction', orderId: m.order.id,
      description: `Перенос дебітора (Варіант B): ${label(m.from)} → ${label(m.to)} (замовлення #${m.order.order_number})`,
      idempotencyKey: `party-repair:${m.order.id}:${m.from}`, createdBy: CREATED_BY,
      meta: { repair: 'debtor-by-channel', from: m.from, to: m.to },
    });
    done++;
  } catch (err) { if (isDup(err)) skipped++; else throw err; }
}

const METHOD: Record<string, 'cash' | 'bank' | 'acquiring'> = { cash: 'cash', transfer: 'bank', bank: 'bank', card: 'acquiring', acquiring: 'acquiring' };
for (const r of reversals) {
  await db.from('order_payments').update({ reversed: true, reversed_at: new Date().toISOString(), reversed_by: CREATED_BY }).eq('id', r.paymentId);
  const { data: active } = await db.from('order_payments').select('amount').eq('order_id', r.order.id).eq('reversed', false);
  const paid = (active ?? []).reduce((s, p) => s + Number(p.amount), 0);
  await db.from('orders').update({ amount_paid: paid, payment_confirmed: r.order.total_price > 0 && paid >= r.order.total_price * 0.999 }).eq('id', r.order.id);
  try {
    const voucher = await createPaymentVoucher({
      doc_type: 'customer_payment_reversal', customer_id: isSpecialDebtor(r.party) ? undefined : r.party, order_id: r.order.id,
      amount: r.amount, created_by: CREATED_BY, meta: { payment_mode: r.paymentMode, reversed_payment_id: r.paymentId, repair: 'acquiring-double' },
    });
    await recordTxn({
      debitAccount: 'customer', debitParty: r.party, creditAccount: METHOD[r.paymentMode] ?? 'bank', creditParty: null,
      amount: r.amount, docId: voucher.id, docType: 'customer_payment_reversal', orderId: r.order.id,
      description: `Сторно задвоєного еквайрингу — замовлення #${r.order.order_number}`,
      idempotencyKey: `order_payment_reversal:${r.paymentId}`, createdBy: CREATED_BY,
      meta: { payment_mode: r.paymentMode, reversed_payment_id: r.paymentId, repair: 'acquiring-double' },
    });
    done++;
  } catch (err) { if (isDup(err)) skipped++; else throw err; }
  const { error } = await db.from('mono_bank_txns').update({ status: 'acquiring' }).eq('id', r.txnId);
  if (error) console.warn(`   ! mono_bank_txns ${r.txnId}: ${error.message} (міграція 110 не застосована?)`);
}

for (const c of codFixes) {
  try {
    await recordTxn({
      debitAccount: 'customer', debitParty: SALE_DEBTOR.npCod, creditAccount: 'novapay', creditParty: null,
      amount: c.amount, businessDate: c.businessDate, docType: 'payment', orderId: c.order.id,
      description: `Сторно «COD зібрано НоваПей»: наложку збирає Rozetka Доставка (замовлення #${c.order.order_number})`,
      idempotencyKey: `cod-collect-repair:${c.order.id}`, createdBy: CREATED_BY, meta: { repair: 'cod-collect-rozetka' },
    });
    done++;
  } catch (err) { if (isDup(err)) skipped++; else throw err; }
}

console.log(`\nПроведено ${done}, пропущено (вже було) ${skipped}.`);
const after = await specialBalances();
console.log('Баланси ПІСЛЯ:', Object.fromEntries(Object.entries(after).map(([k, v]) => [k, fmt(v)])));
