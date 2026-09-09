/**
 * Імпорт реєстру переказів RozetkaPay (XLSX із кабінету) → рознесення виплат
 * по замовленнях ЗА ФАКТОМ, а не підбором. Правила й розбір — lib/rozetkapay-register.
 *
 * Один реєстр може накривати кілька виплат: у файлі за 07–08.09 обидва платежі
 * мали «Дата перерахування» 09.09, а у виписці Mono це окремі перекази за
 * 07.09 і за 08.09. Тому рядки групуються за датою перерахування, і для кожної
 * групи шукається СВІЙ переказ RozetkaPay у виписці (дата зарахування = дата
 * перерахування; при кількох у день — за брутто).
 *
 * Далі для кожної виплати: сторнувати зайве з підбору (rzpay-alloc-undo:{txn}:{order}[:seq])
 * і провести відсутнє (rzpay-alloc:{txn}:{order}[:seq]). Ключі ті самі, що й у
 * крона, тож двигун підбору бачить результат як «рознесено» і не чіпає цю виплату.
 */
import * as XLSX from 'xlsx';
import { createServiceClient } from './supabase';
import { recordTxn } from './accounting/money';
import { SALE_DEBTOR, saleDebitPartyFor } from './accounting/sale-party';
import { parseRzPayPayout } from './rozetkapay-statement';
import { parseRzPayRegister, planRzPayRegisterApply, type RzPayKnownOrder, type RzPayRegister, type RzPayRegisterRow } from './rozetkapay-register';
import { fetchAllRows } from './db-paginate';

export type RzPayRegisterApplyResult = {
  register: { contract: string | null; periodFrom: string; periodTo: string; rows: number; totalGross: number; totalNet: number };
  payouts: { payoutDate: string; monoTxnId: string | null; gross: number; net: number | null; rows: number }[];
  posted: { orderNumber: number; amount: number }[];
  undone: { orderNumber: number; amount: number }[];
  kept: number;
  unknown: { marketplaceOrderId: string; project: string; gross: number }[];
  warnings: string[];
};

type Db = ReturnType<typeof createServiceClient>;
type O = { id: string; order_number: number; prom_order_id: string | number | null; rozetka_order_id: string | number | null; channel_code: string | null; payment_type: string | null; delivery_type: string | null; customer_id: string | null };
const ORDER_SEL = 'id, order_number, prom_order_id, rozetka_order_id, channel_code, payment_type, delivery_type, customer_id';

const isDup = (err: unknown) => /unique|duplicate|23505/.test(String(err instanceof Error ? err.message : err));
const r2 = (n: number) => Math.round(n * 100) / 100;

export function readRzPayRegisterXlsx(buffer: Buffer): RzPayRegister {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('Порожній файл');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
  return parseRzPayRegister(rows);
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

export async function applyRzPayRegister(buffer: Buffer, createdBy: string, opts: { dryRun?: boolean } = {}): Promise<RzPayRegisterApplyResult> {
  const db = createServiceClient();
  const dry = !!opts.dryRun;
  const register = readRzPayRegisterXlsx(buffer);
  const res: RzPayRegisterApplyResult = {
    register: { contract: register.contract, periodFrom: register.periodFrom, periodTo: register.periodTo, rows: register.rows.length, totalGross: register.totalGross, totalNet: register.totalNet },
    payouts: [], posted: [], undone: [], kept: 0, unknown: [], warnings: dry ? ['Перегляд без запису'] : [],
  };

  // Наші замовлення за id площадки — одним запитом на весь файл
  const promIds = register.rows.filter(r => r.marketplace !== 'rozetka').map(r => r.marketplaceOrderId).filter(Boolean);
  const rzIds   = register.rows.filter(r => r.marketplace !== 'prom').map(r => r.marketplaceOrderId).filter(Boolean);
  const [{ data: byProm }, { data: byRz }] = await Promise.all([
    promIds.length ? db.from('orders').select(ORDER_SEL).in('prom_order_id', promIds).limit(promIds.length) : Promise.resolve({ data: [] as O[] }),
    rzIds.length   ? db.from('orders').select(ORDER_SEL).in('rozetka_order_id', rzIds).limit(rzIds.length)  : Promise.resolve({ data: [] as O[] }),
  ]);
  const known = (o: O): RzPayKnownOrder => ({ id: o.id, order_number: o.order_number, party: saleDebitPartyFor(o) });
  const promMap = new Map((byProm ?? []).map(o => [String(o.prom_order_id), known(o as O)]));
  const rzMap   = new Map((byRz ?? []).map(o => [String(o.rozetka_order_id), known(o as O)]));
  const lookup = (mp: 'prom' | 'rozetka' | null, id: string) =>
    mp === 'prom' ? promMap.get(id) ?? null : mp === 'rozetka' ? rzMap.get(id) ?? null : promMap.get(id) ?? rzMap.get(id) ?? null;

  // Групи за датою перерахування — кожна група = окремий переказ у виписці
  const groups = new Map<string, RzPayRegisterRow[]>();
  for (const row of register.rows) groups.set(row.payoutDate, [...(groups.get(row.payoutDate) ?? []), row]);

  for (const [payoutDate, rows] of [...groups.entries()].sort()) {
    const gross = r2(rows.reduce((s, r) => s + r.gross, 0));
    const found = await findPayout(db, payoutDate, gross);
    if (!found) {
      res.payouts.push({ payoutDate, monoTxnId: null, gross, net: null, rows: rows.length });
      res.warnings.push(`Переказ RozetkaPay від ${payoutDate} на ${gross} ₴ у виписці Mono не знайдено — ще не прийшов або виписку не оновлено; ${rows.length} рядк. пропущено`);
      continue;
    }
    const txn = found.row.id as string;
    if (Math.abs(found.parsed!.gross - gross) >= 0.01) {
      res.warnings.push(`${payoutDate}: брутто реєстру ${gross} ₴ ≠ брутто переказу ${found.parsed!.gross} ₴ — рознесено те, що є в реєстрі, різниця лишається на клірингу`);
    }
    res.payouts.push({ payoutDate, monoTxnId: txn, gross: found.parsed!.gross, net: Number(found.row.amount), rows: rows.length });

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
    const period = found.parsed!.periodFrom === found.parsed!.periodTo ? found.parsed!.periodFrom : `${found.parsed!.periodFrom}…${found.parsed!.periodTo}`;
    const businessDate = String(found.row.txn_time).slice(0, 10);

    // Сторно чужого складу (замовлення, яких у реєстрі немає): сторону беремо із замовлення
    for (const u of plan.undo) {
      let party = u.party, orderNumber = u.orderNumber;
      if (!party) {
        const { data: o } = await db.from('orders').select(ORDER_SEL).eq('id', u.orderId).maybeSingle();
        if (!o) { res.warnings.push(`Замовлення ${u.orderId} з попереднього складу не знайдено — сторно пропущено`); continue; }
        party = saleDebitPartyFor(o as O); orderNumber = (o as O).order_number;
      }
      res.undone.push({ orderNumber, amount: u.amount });
      if (dry) continue;
      const seq = (keyCount[`rzpay-alloc-undo:${u.orderId}`] ?? 0) + 1;
      try {
        await recordTxn({
          debitAccount: 'customer', debitParty: party, creditAccount: 'customer', creditParty: SALE_DEBTOR.rozetkapay,
          amount: u.amount, businessDate, docType: 'payment', orderId: u.orderId,
          description: `Сторно: #${orderNumber} не входить у виплату RozetkaPay за операції ${period} (за реєстром із кабінету)`,
          idempotencyKey: `rzpay-alloc-undo:${txn}:${u.orderId}${seq > 1 ? ':' + seq : ''}`, createdBy,
          meta: { mono_txn_id: txn, storno: true, source: 'rzpay-register' },
        });
      } catch (err) { if (!isDup(err)) throw err; }
    }

    for (const p of plan.post) {
      res.posted.push({ orderNumber: p.orderNumber, amount: p.amount });
      if (dry) continue;
      const seq = (keyCount[`rzpay-alloc:${p.orderId}`] ?? 0) + 1;
      try {
        await recordTxn({
          debitAccount: 'customer', debitParty: SALE_DEBTOR.rozetkapay, creditAccount: 'customer', creditParty: p.party,
          amount: p.amount, businessDate, docType: 'payment', orderId: p.orderId,
          description: `Виплата RozetkaPay за операції ${period} — замовлення #${p.orderNumber} (реєстр із кабінету)`,
          idempotencyKey: `rzpay-alloc:${txn}:${p.orderId}${seq > 1 ? ':' + seq : ''}`, createdBy,
          meta: { mono_txn_id: txn, rzpay_period: [found.parsed!.periodFrom, found.parsed!.periodTo], source: 'rzpay-register', marketplace_order_id: p.marketplaceOrderId },
        });
      } catch (err) { if (!isDup(err)) throw err; }
    }

    if (dry) continue;
    const composed = [...new Set(rows.map(r => lookup(r.marketplace, r.marketplaceOrderId)?.order_number).filter((n): n is number => !!n))];
    const noteParts = [`реєстр RozetkaPay${register.generatedAt ? ' від ' + register.generatedAt : ''}: ${composed.map(n => '#' + n).join(' ')}`];
    if (plan.unknown.length) noteParts.push(`без нашого замовлення: ${plan.unknown.map(u => `${u.marketplaceOrderId} (${u.gross} ₴)`).join(', ')}`);
    await db.from('mono_bank_txns').update({ category: plan.unknown.length ? null : 'rzpay:allocated', note: noteParts.join('; ') }).eq('id', txn);
  }
  if (res.unknown.length) res.warnings.push(`${res.unknown.length} рядк. реєстру без нашого замовлення — лишаються на клірингу`);
  return res;
}
