/**
 * Ремонт обліку рахунку NovaPay (аудит K3, рішення власника 06.09.2026).
 *
 * Що було: при врученні наложки писалось «COD зібрано НоваПей» (DR novapay /
 * CR np:cod) — фікція: реальні зачислення на рахунок і списання з нього в облік
 * не заходили (за обліком 58 тис. при живих 8 тис.).
 *
 * Кроки (append-only, ідемпотентно):
 *   A. Сторно решти «COD зібрано НоваПей» (ключ cod-collect-repair:{orderId}).
 *   A2. Перший прогін 06.09 провів виплати СУМОЮ (np-payout:{docId}) і три
 *       помісячні утримання за правилом дат — до того, як з'ясувалось, що НоваПей
 *       платить день у день мінус 0,5 % і склад реєстру підбирається точно.
 *       Сторнуємо їх (np-payout-undo:{docId}, np-deduction-undo:…) і скидаємо
 *       рядки виплат у unmatched, щоб провести по ЕН.
 *   B. Виписка NovaPay з відкриття рахунку (16.07.2026) → novapay_txns.
 *   B2. postNpPayouts: по кожному реєстру — підбір ЕН, DR novapay + DR logistics[np]
 *       (0,5 %) / CR np:cod; непідібрані — сумою.
 *   Списання лишаються unmatched — категоризує власник на екрані «НоваПей».
 *
 *   npx tsx --env-file=.env.local scripts/repair-novapay-ledger.mts           # план
 *   npx tsx --env-file=.env.local scripts/repair-novapay-ledger.mts --apply   # провести
 */
import * as fs from 'node:fs';
import * as supabaseNS from '../lib/supabase';
import * as moneyNS from '../lib/accounting/money';
import * as ingestNS from '../lib/novapay-ingest';
import * as pagNS from '../lib/db-paginate';

type Mod<T> = T & { default?: T };
const { createServiceClient } = ((supabaseNS as Mod<typeof supabaseNS>).default ?? supabaseNS);
const { recordTxn } = ((moneyNS as Mod<typeof moneyNS>).default ?? moneyNS);
const { ingestNovapayStatement, postNpPayouts } = ((ingestNS as Mod<typeof ingestNS>).default ?? ingestNS);
const { fetchAllRows } = ((pagNS as Mod<typeof pagNS>).default ?? pagNS);

const apply = process.argv.includes('--apply');
const BY = 'script:repair-novapay-ledger';
const db = createServiceClient();
const fmt = (n: number) => n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const isDup = (err: unknown) => /unique|duplicate|23505/.test(String(err instanceof Error ? err.message : err));

type E = { id: string; order_id: string | null; amount: number; business_date: string; idempotency_key: string | null; account_type: string; counterparty_id: string | null; description: string | null };
const entries = await fetchAllRows<E>((f, t) => db.from('money_entries')
  .select('id, order_id, amount, business_date, idempotency_key, account_type, counterparty_id, description')
  .not('idempotency_key', 'is', null).order('created_at').order('id').range(f, t));
const keyed = (prefix: string) => entries.filter(e => e.idempotency_key!.startsWith(prefix));
const keys = new Set(entries.map(e => e.idempotency_key!));

async function npBalances() {
  const [{ data: cod }, { data: nv }] = await Promise.all([
    db.from('counterparty_balances').select('balance').eq('account_type', 'customer').eq('counterparty_id', 'np:cod').maybeSingle(),
    db.from('money_entries').select('amount').eq('account_type', 'novapay').limit(20000),
  ]);
  return { npCod: Number(cod?.balance ?? 0), novapayLedger: Math.round((nv ?? []).reduce((s, r) => s + Number(r.amount), 0) * 100) / 100 };
}

// ── A. фіктивні збори, ще не сторновані ────────────────────────────────────────
const collects = keyed('cod-collect:').filter(e => e.account_type === 'novapay');
const repairedOrders = new Set(keyed('cod-collect-repair:').map(e => e.idempotency_key!.slice('cod-collect-repair:'.length)));
const toReverse = collects.filter(c => c.order_id && !repairedOrders.has(c.order_id));
console.log(`A. Сторно «COD зібрано НоваПей»: ${toReverse.length} (Σ ${fmt(toReverse.reduce((s, c) => s + Number(c.amount), 0))} ₴); уже сторновано: ${repairedOrders.size}`);

// ── A2. агрегатні виплати й утримання першого прогону ──────────────────────────
// np-payout:{docId} (без orderId) — сумою; np-payout:{docId}:{orderId} — по ЕН
const aggregate = keyed('np-payout:').filter(e => e.account_type === 'novapay' && e.idempotency_key!.split(':').length === 2 && !keys.has(`np-payout-undo:${e.idempotency_key!.slice('np-payout:'.length)}`));
const deductions = keyed('np-deduction:').filter(e => !e.idempotency_key!.endsWith(':v2') && !keys.has(`np-deduction-undo:${e.idempotency_key!.slice('np-deduction:'.length)}`));
console.log(`A2. Сторно агрегатних виплат: ${aggregate.length} (Σ ${fmt(aggregate.reduce((s, e) => s + Number(e.amount), 0))} ₴); сторно утримань v1: ${deductions.length}`);

const before = await npBalances();
console.log('Баланси ДО:', { 'np:cod': fmt(before.npCod), 'novapay за обліком': fmt(before.novapayLedger) });

if (!apply) {
  console.log('\nB/B2/C (виписка з 16.07.2026, підбір ЕН, утримання) — лише з --apply.');
  process.exit(0);
}

fs.writeFileSync(`scripts/.repair-novapay-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, JSON.stringify({ at: new Date().toISOString(), collects, aggregate, deductions, before }, null, 2));

let done = 0;
for (const c of toReverse) {
  const { data: o } = await db.from('orders').select('order_number').eq('id', c.order_id!).maybeSingle();
  try {
    await recordTxn({
      debitAccount: 'customer', debitParty: 'np:cod', creditAccount: 'novapay', creditParty: null,
      amount: Number(c.amount), businessDate: c.business_date, docType: 'payment', orderId: c.order_id,
      description: `Сторно фіктивного «COD зібрано НоваПей» (замовлення #${o?.order_number ?? '?'}): виплата — за випискою NovaPay`,
      idempotencyKey: `cod-collect-repair:${c.order_id}`, createdBy: BY, meta: { repair: 'novapay-ledger' },
    });
    done++;
  } catch (err) { if (!isDup(err)) throw err; }
}
console.log(`A. Проведено сторно: ${done}`);

let undone = 0;
for (const e of aggregate) {
  const docId = e.idempotency_key!.slice('np-payout:'.length);
  try {
    await recordTxn({
      debitAccount: 'customer', debitParty: 'np:cod', creditAccount: 'novapay', creditParty: null,
      amount: Number(e.amount), businessDate: e.business_date, docType: 'payment',
      description: `Сторно виплати сумою (документ ${docId}) — переведено на облік по ЕН`,
      idempotencyKey: `np-payout-undo:${docId}`, createdBy: BY, meta: { repair: 'novapay-ledger', novapay_doc_id: docId },
    });
    undone++;
  } catch (err) { if (!isDup(err)) throw err; }
  await db.from('novapay_txns').update({ status: 'unmatched', category: null, note: null, txn_id: null, posted_at: null, posted_by: null }).eq('id', docId);
}
for (const e of deductions) {
  const tail = e.idempotency_key!.slice('np-deduction:'.length);
  // оригінал: дебет logistics (d) або дебет np:cod (c); сторно — навпаки
  const isDebit = e.account_type === 'logistics' ? Number(e.amount) > 0 : Number(e.amount) < 0;
  try {
    await recordTxn({
      debitAccount:  isDebit ? 'customer' : 'logistics', debitParty:  isDebit ? 'np:cod' : 'np',
      creditAccount: isDebit ? 'logistics' : 'customer', creditParty: isDebit ? 'np' : 'np:cod',
      amount: Math.abs(Number(e.amount)), businessDate: e.business_date, docType: 'np_deduction',
      description: `Сторно утримання НП v1 (${tail}) — переведено на облік по ЕН`,
      idempotencyKey: `np-deduction-undo:${tail}`, createdBy: BY, meta: { repair: 'novapay-ledger' },
    });
    undone++;
  } catch (err) { if (!isDup(err)) throw err; }
}
console.log(`A2. Проведено сторно: ${undone}`);

// ── B. виписка з відкриття рахунку ─────────────────────────────────────────────
const ingest = await ingestNovapayStatement(0, new Date('2026-07-16T00:00:00'));
console.log(`B. Виписка ${ingest.from}…${ingest.to}: документів ${ingest.fetched}, нових ${ingest.inserted}`);

// ── B2. виплати по ЕН ──────────────────────────────────────────────────────────
const p = await postNpPayouts(BY);
console.log(`B2. Реєстрів проведено ${p.processed}: по ЕН ${p.matched} (${p.orders} замовлень), сумою ${p.aggregate}; нетто ${fmt(p.net)} ₴`);
const { data: agg } = await db.from('novapay_txns').select('txn_date, amount, register_no').eq('category', 'cod_payout_aggregate').order('txn_date');
for (const a of agg ?? []) console.log(`    сумою: ${a.txn_date} ${fmt(Number(a.amount))} ₴ (реєстр ${a.register_no})`);

const after = await npBalances();
console.log('Баланси ПІСЛЯ:', { 'np:cod': fmt(after.npCod), 'novapay за обліком': fmt(after.novapayLedger) });
const { count: unmatched } = await db.from('novapay_txns').select('id', { count: 'exact', head: true }).eq('status', 'unmatched');
console.log(`Списань на категоризацію (екран «НоваПей»): ${unmatched ?? 0}`);
