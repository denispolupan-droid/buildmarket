/**
 * Імпорт виплат RozetkaPay з кабінету (реєстр XLSX або розгорнутий експорт
 * транзакцій CSV) → рознесення переказів по замовленнях ЗА ФАКТОМ, а не підбором.
 * Розбір і план — lib/rozetkapay-register.
 *
 * Рядки групуються за датою перерахування торговцю, і для кожної групи шукається
 * СВІЙ переказ RozetkaPay у виписці Mono (дата зарахування = дата перерахування;
 * при кількох у день — за брутто). Один файл може накривати всю історію.
 *
 * Далі для кожного переказу: сторнувати зайве з підбору (rzpay-alloc-undo:{txn}:{order}[:seq])
 * і провести відсутнє (rzpay-alloc:{txn}:{order}[:seq]). Ключі ті самі, що й у
 * крона, тож двигун підбору бачить результат як «рознесено» і не чіпає ці виплати.
 */
import * as XLSX from 'xlsx';
import { createServiceClient } from './supabase';
import { recordTxn } from './accounting/money';
import { SALE_DEBTOR, saleDebitPartyFor } from './accounting/sale-party';
import { parseRzPayPayout } from './rozetkapay-statement';
import { parseRzPayRegister, parseRzPayTransactionsCsv, planRzPayRegisterApply, type RzPayKnownOrder, type RzPayLookup, type RzPayRegister, type RzPayRegisterRow } from './rozetkapay-register';
import { fetchAllRows } from './db-paginate';

export type RzPayRegisterApplyResult = {
  register: { contract: string | null; periodFrom: string; periodTo: string; rows: number; totalGross: number; totalNet: number; pending: number };
  payouts: { payoutDate: string; monoTxnId: string | null; gross: number; net: number | null; rows: number; changed: boolean }[];
  posted: { orderNumber: number; amount: number; payoutDate: string }[];
  undone: { orderNumber: number; amount: number; payoutDate: string }[];
  kept: number;
  unknown: { marketplaceOrderId: string; project: string; gross: number }[];
  warnings: string[];
};

type Db = ReturnType<typeof createServiceClient>;
type O = { id: string; order_number: number; prom_order_id: string | number | null; rozetka_order_id: string | number | null; tracking_number: string | null; channel_code: string | null; payment_type: string | null; delivery_type: string | null; customer_id: string | null; total_price: number | string | null };
const ORDER_SEL = 'id, order_number, prom_order_id, rozetka_order_id, tracking_number, channel_code, payment_type, delivery_type, customer_id, total_price';

const isDup = (err: unknown) => /unique|duplicate|23505/.test(String(err instanceof Error ? err.message : err));
const r2 = (n: number) => Math.round(n * 100) / 100;

export function readRzPayRegisterXlsx(buffer: Buffer): RzPayRegister {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('Порожній файл');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
  return parseRzPayRegister(rows);
}

/** Файл з кабінету за розширенням: .csv — експорт транзакцій, .xlsx — реєстр за період. */
export function readRzPayFile(buffer: Buffer, filename: string): RzPayRegister {
  return /\.csv$/i.test(filename) ? parseRzPayTransactionsCsv(buffer.toString('utf8')) : readRzPayRegisterXlsx(buffer);
}

/** Переказ RozetkaPay у виписці Mono за датою перерахування (і брутто, якщо їх кілька за день). */
async function findPayout(db: Db, payoutDate: string, gross: number) {
  const { data } = await db.from('mono_bank_txns')
    .select('id, txn_time, amount, comment, description, counter_name, category, note')
    .eq('direction', 'in').ilike('comment', '%Переказ коштів за операції%')
    .gte('txn_time', `${payoutDate}T00:00:00`).lt('txn_time', `${payoutDate}T23:59:59.999`)
    .order('txn_time', { ascending: true }).limit(20);
  const rows = (data ?? []).map(r => ({ row: r, parsed: parseRzPayPayout({ amount: Math.round(Number(r.amount) * 100), comment: r.comment, description: r.description, counterName: r.counter_name }) }))
    .filter(x => x.parsed);
  if (!rows.length) return null;
  return rows.find(x => Math.abs(x.parsed!.gross - gross) < 0.01) ?? (rows.length === 1 ? rows[0] : null);
}

/** Наші замовлення для всіх рядків файлу: за id Prom, id Rozetka, нашим номером і номером накладної. */
async function buildLookup(db: Db, rows: RzPayRegisterRow[]): Promise<RzPayLookup> {
  const ids = [...new Set(rows.map(r => r.marketplaceOrderId).filter(Boolean))];
  const promIds = ids.filter(id => /^\d{6,}$/.test(id) && !/^26\d{6}$/.test(id));
  const ourNums = ids.filter(id => /^26\d{6}$/.test(id)).map(Number);
  const refs = [...new Set(rows.map(r => r.ref).filter((x): x is string => !!x))];
  const [byProm, byRz, byNum, byRef] = await Promise.all([
    promIds.length ? db.from('orders').select(ORDER_SEL).in('prom_order_id', promIds).limit(promIds.length) : Promise.resolve({ data: [] as O[] }),
    promIds.length ? db.from('orders').select(ORDER_SEL).in('rozetka_order_id', promIds).limit(promIds.length) : Promise.resolve({ data: [] as O[] }),
    ourNums.length ? db.from('orders').select(ORDER_SEL).in('order_number', ourNums).limit(ourNums.length) : Promise.resolve({ data: [] as O[] }),
    refs.length    ? db.from('orders').select(ORDER_SEL).in('tracking_number', refs).limit(refs.length * 3) : Promise.resolve({ data: [] as O[] }),
  ]);
  const known = (o: O): RzPayKnownOrder => ({ id: o.id, order_number: o.order_number, party: saleDebitPartyFor(o), total: Number(o.total_price) || null });
  const promMap = new Map(((byProm.data ?? []) as O[]).map(o => [String(o.prom_order_id), known(o)]));
  const rzMap   = new Map(((byRz.data ?? []) as O[]).map(o => [String(o.rozetka_order_id), known(o)]));
  const numMap  = new Map(((byNum.data ?? []) as O[]).map(o => [String(o.order_number), known(o)]));
  const refMap  = new Map(((byRef.data ?? []) as O[]).map(o => [String(o.tracking_number).toUpperCase(), known(o)]));
  return (mp, id, ref) => {
    if (mp === 'prom') return promMap.get(id) ?? (ref ? refMap.get(ref) ?? null : null);
    if (mp === 'rozetka') return rzMap.get(id) ?? numMap.get(id) ?? (ref ? refMap.get(ref) ?? null : null);
    return promMap.get(id) ?? rzMap.get(id) ?? numMap.get(id) ?? (ref ? refMap.get(ref) ?? null : null);
  };
}

export async function applyRzPayRegisterFile(buffer: Buffer, filename: string, createdBy: string, opts: { dryRun?: boolean } = {}): Promise<RzPayRegisterApplyResult> {
  return applyParsedRzPayRegister(readRzPayFile(buffer, filename), createdBy, opts);
}

/** Зворотна сумісність: XLSX-реєстр. */
export async function applyRzPayRegister(buffer: Buffer, createdBy: string, opts: { dryRun?: boolean } = {}): Promise<RzPayRegisterApplyResult> {
  return applyParsedRzPayRegister(readRzPayRegisterXlsx(buffer), createdBy, opts);
}

export async function applyParsedRzPayRegister(register: RzPayRegister, createdBy: string, opts: { dryRun?: boolean } = {}): Promise<RzPayRegisterApplyResult> {
  const db = createServiceClient();
  const dry = !!opts.dryRun;
  const res: RzPayRegisterApplyResult = {
    register: { contract: register.contract, periodFrom: register.periodFrom, periodTo: register.periodTo, rows: register.rows.length, totalGross: register.totalGross, totalNet: register.totalNet, pending: register.pending.length },
    payouts: [], posted: [], undone: [], kept: 0, unknown: [], warnings: dry ? ['Перегляд без запису'] : [],
  };
  const lookup = await buildLookup(db, register.rows);

  // Групи за датою перерахування — кожна група = окремий переказ у виписці
  const groups = new Map<string, RzPayRegisterRow[]>();
  for (const row of register.rows) groups.set(row.payoutDate, [...(groups.get(row.payoutDate) ?? []), row]);

  for (const [payoutDate, rows] of [...groups.entries()].sort()) {
    const gross = r2(rows.reduce((s, r) => s + r.gross, 0));
    const found = await findPayout(db, payoutDate, gross);
    if (!found) {
      res.payouts.push({ payoutDate, monoTxnId: null, gross, net: null, rows: rows.length, changed: false });
      res.warnings.push(`Переказ RozetkaPay від ${payoutDate} на ${gross} ₴ у виписці Mono не знайдено — ще не прийшов або виписку не оновлено; ${rows.length} рядк. пропущено`);
      continue;
    }
    const txn = found.row.id as string;
    if (Math.abs(found.parsed!.gross - gross) >= 0.01) {
      res.warnings.push(`${payoutDate}: брутто файлу ${gross} ₴ ≠ брутто переказу ${found.parsed!.gross} ₴ — рознесено те, що є у файлі, різниця лишається на клірингу`);
    }

    // Що вже проведено на цю виплату (alloc − undo) і лічильники ключів для seq
    const keyed = await fetchAllRows<{ idempotency_key: string; amount: number }>((f, t) => db
      .from('money_entries').select('idempotency_key, amount')
      .or(`idempotency_key.like.rzpay-alloc:${txn}:%,idempotency_key.like.rzpay-alloc-undo:${txn}:%`).range(f, t));
    const existingNet: Record<string, number> = {};
    const keyCount: Record<string, number> = {};
    for (const r of keyed) {
      const [kind, , order] = r.idempotency_key.split(':');
      if (!order) continue;
      existingNet[order] = r2((existingNet[order] ?? 0) + (kind === 'rzpay-alloc-undo' ? -1 : 1) * Math.abs(Number(r.amount)));
      keyCount[`${kind}:${order}`] = (keyCount[`${kind}:${order}`] ?? 0) + 1;
    }

    const plan = planRzPayRegisterApply({ ...register, rows }, lookup, existingNet);
    res.unknown.push(...plan.unknown);
    res.kept += plan.keep;
    for (const o of plan.overpaid) {
      res.warnings.push(`${payoutDate}: платіж ${o.amount} ₴ на #${o.orderNumber} більший за суму замовлення ${o.total} ₴ — на нього проведено ${o.total} ₴, решта ${o.leftover} ₴ (інші замовлення того ж рахунку) лишається на клірингу`);
    }
    const changed = plan.post.length > 0 || plan.undo.length > 0;
    res.payouts.push({ payoutDate, monoTxnId: txn, gross: found.parsed!.gross, net: Number(found.row.amount), rows: rows.length, changed });
    const period = found.parsed!.periodFrom === found.parsed!.periodTo ? found.parsed!.periodFrom : `${found.parsed!.periodFrom}…${found.parsed!.periodTo}`;
    const businessDate = String(found.row.txn_time).slice(0, 10);

    // Сторно чужого складу (замовлення, яких у файлі немає): сторону беремо із замовлення
    for (const u of plan.undo) {
      let party = u.party, orderNumber = u.orderNumber;
      if (!party) {
        const { data: o } = await db.from('orders').select(ORDER_SEL).eq('id', u.orderId).maybeSingle();
        if (!o) { res.warnings.push(`Замовлення ${u.orderId} з попереднього складу не знайдено — сторно пропущено`); continue; }
        party = saleDebitPartyFor(o as O); orderNumber = (o as O).order_number;
      }
      res.undone.push({ orderNumber, amount: u.amount, payoutDate });
      if (dry) continue;
      const seq = (keyCount[`rzpay-alloc-undo:${u.orderId}`] ?? 0) + 1;
      try {
        await recordTxn({
          debitAccount: 'customer', debitParty: party, creditAccount: 'customer', creditParty: SALE_DEBTOR.rozetkapay,
          amount: u.amount, businessDate, docType: 'payment', orderId: u.orderId,
          description: `Сторно: #${orderNumber} не входить у виплату RozetkaPay за операції ${period} (за файлом із кабінету)`,
          idempotencyKey: `rzpay-alloc-undo:${txn}:${u.orderId}${seq > 1 ? ':' + seq : ''}`, createdBy,
          meta: { mono_txn_id: txn, storno: true, source: 'rzpay-register' },
        });
      } catch (err) { if (!isDup(err)) throw err; }
    }

    for (const p of plan.post) {
      res.posted.push({ orderNumber: p.orderNumber, amount: p.amount, payoutDate });
      if (dry) continue;
      const seq = (keyCount[`rzpay-alloc:${p.orderId}`] ?? 0) + 1;
      try {
        await recordTxn({
          debitAccount: 'customer', debitParty: SALE_DEBTOR.rozetkapay, creditAccount: 'customer', creditParty: p.party,
          amount: p.amount, businessDate, docType: 'payment', orderId: p.orderId,
          description: `Виплата RozetkaPay за операції ${period} — замовлення #${p.orderNumber} (файл із кабінету)`,
          idempotencyKey: `rzpay-alloc:${txn}:${p.orderId}${seq > 1 ? ':' + seq : ''}`, createdBy,
          meta: { mono_txn_id: txn, rzpay_period: [found.parsed!.periodFrom, found.parsed!.periodTo], source: 'rzpay-register', marketplace_order_id: p.marketplaceOrderId },
        });
      } catch (err) { if (!isDup(err)) throw err; }
    }

    if (dry) continue;
    const composed = [...new Set(rows.map(r => lookup(r.marketplace, r.marketplaceOrderId, r.ref)?.order_number).filter((n): n is number => !!n))];
    const noteParts = [`за файлом RozetkaPay${register.generatedAt ? ' від ' + register.generatedAt : ''}: ${composed.map(n => '#' + n).join(' ')}`];
    if (plan.unknown.length) noteParts.push(`без нашого замовлення: ${plan.unknown.map(u => `${u.marketplaceOrderId} (${u.gross} ₴)`).join(', ')}`);
    await db.from('mono_bank_txns').update({ category: plan.unknown.length ? null : 'rzpay:allocated', note: noteParts.join('; ') }).eq('id', txn);
  }
  if (res.unknown.length) res.warnings.push(`${res.unknown.length} рядк. файлу без нашого замовлення — лишаються на клірингу`);
  if (register.pending.length) res.warnings.push(`${register.pending.length} оплат ще без дати перерахування (${r2(register.pending.reduce((s, p) => s + p.gross, 0))} ₴) — RozetkaPay ще не виплатила`);
  return res;
}
