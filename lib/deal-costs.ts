/**
 * Розбивка проведених без замовлення витрат угоди по замовленнях — запис і
 * читання таблиці order_deal_costs (міграції 158, 159). Правила — lib/deal-costs-rules.
 *
 * Джерела:
 *   rzpay_fee     — винагорода RozetkaPay за переказ (ключ проводки rzpay-fee:{mono id});
 *                   розбивка — з реєстру виплати (розбір реєстру, пошта і ручне завантаження)
 *   acquiring_fee — комісія банку за еквайринг (acq-fee:{mono id}); один платіж = одне
 *                   замовлення (allocateAcquiringFee, викликає lib/mono-ingest)
 * ЄДИНЕ місце, що пише в order_deal_costs: writeDealCostAllocation. Разовий
 * перерахунок історії — scripts/backfill-rzpay-fees.ts. Леджер не змінюється.
 */
import { createServiceClient, asJson } from './supabase-service';
import { fetchAllRows } from './db-paginate';
import { capToLedger, rzPayRate, type FeeAllocation } from './deal-costs-rules';
import { saleDebitPartyFor, SALE_DEBTOR, type SalePartyOrder } from './accounting/sale-party';
import { classifyMonoTxn, PG_INT4_MAX, type MonoStatementItem } from './mono-statement';

export type DealCostSource = 'rzpay_fee' | 'acquiring_fee';
/** Префікс ключа проводки, яку розбиває кожне джерело (решта ключа — id рядка виписки Mono). */
export const LEDGER_KEY_PREFIX: Record<DealCostSource, string> = { rzpay_fee: 'rzpay-fee:', acquiring_fee: 'acq-fee:' };
export const DEAL_COST_LABEL: Record<DealCostSource, string> = { rzpay_fee: 'Винагорода RozetkaPay', acquiring_fee: 'Еквайринг Monobank' };

type Db = ReturnType<typeof createServiceClient>;
const r2 = (n: number) => Math.round(n * 100) / 100;
const CHUNK = 200;   // id у URL запиту: на ~400+ UUID PostgREST відповідає «Bad Request»

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** Проведена сума, яку розбиває джерело (ключ {prefix}{mono id}); null — ще не проведена. */
export async function ledgerDealCost(db: Db, source: DealCostSource, monoTxnId: string): Promise<{ amount: number; businessDate: string } | null> {
  const { data } = await db.from('money_entries')
    .select('amount, business_date')
    .eq('idempotency_key', `${LEDGER_KEY_PREFIX[source]}${monoTxnId}`)
    .limit(1).maybeSingle();
  if (!data) return null;
  return { amount: r2(Number(data.amount)), businessDate: String(data.business_date) };
}

export type RzPayFeeWriteResult =
  | { status: 'written'; allocated: number; ledgerFee: number; orders: number; capped: boolean }
  | { status: 'no-ledger-fee' }      // переказ є, а проводки винагороди ще немає — повторити пізніше
  | { status: 'zero-fee' };          // переказ без винагороди — розбивати нічого
export type DealCostWriteResult = RzPayFeeWriteResult;

/**
 * Атомарно замінює розбивку однієї проведеної суми. Розбивка обмежується
 * проведеною сумою; решта лишається «без замовлення».
 */
export async function writeDealCostAllocation(db: Db, params: {
  source: DealCostSource; monoTxnId: string; allocs: FeeAllocation[]; method: 'register' | 'proportional' | 'payment'; dryRun?: boolean;
}): Promise<DealCostWriteResult> {
  const ledger = await ledgerDealCost(db, params.source, params.monoTxnId);
  if (!ledger) return { status: 'no-ledger-fee' };
  if (!(ledger.amount > 0)) return { status: 'zero-fee' };
  const { allocs, capped } = capToLedger(params.allocs, ledger.amount);
  const allocated = r2(allocs.reduce((s, a) => s + a.amount, 0));
  if (!params.dryRun) {
    const { error } = await db.rpc('replace_order_deal_costs', {
      p_source: params.source, p_ref: params.monoTxnId, p_business_date: ledger.businessDate, p_method: params.method,
      p_rows: asJson(allocs.map(a => ({ order_id: a.orderId, amount: a.amount, meta: a.meta }))),
    });
    if (error) throw error;
  }
  return { status: 'written', allocated, ledgerFee: ledger.amount, orders: allocs.length, capped };
}

/** Винагорода RozetkaPay одного переказу. */
export function writeRzPayFeeAllocation(db: Db, params: {
  monoTxnId: string; allocs: FeeAllocation[]; method: 'register' | 'proportional'; dryRun?: boolean;
}): Promise<DealCostWriteResult> {
  return writeDealCostAllocation(db, { source: 'rzpay_fee', ...params });
}

export type AcquiringAllocResult =
  | { status: 'written'; orderNumber: number; amount: number; by: 'number' | 'amount' }
  | { status: 'topup' }              // поповнення балансу дропшипера — не замовлення
  | { status: 'no-order'; reason: string }
  | { status: 'no-ledger-fee' } | { status: 'zero-fee' };

/**
 * Комісія еквайрингу одного «Покриття …» з виписки Mono → замовлення, за яке
 * платили карткою: номер у призначенні («Оплата замовлення №26081164») або, без
 * номера, ЄДИНЕ карткове замовлення сайту з тією самою сумою за 3 доби до
 * покриття (так само, як перевірка «оплата без замовлення» в mono-ingest).
 * Кілька кандидатів — нічого не вгадуємо, лишається «без замовлення».
 */
export async function allocateAcquiringFee(db: Db, monoTxnId: string, opts: { dryRun?: boolean } = {}): Promise<AcquiringAllocResult> {
  const { data: txn } = await db.from('mono_bank_txns').select('id, raw, comment, txn_time').eq('id', monoTxnId).maybeSingle();
  if (!txn) return { status: 'no-order', reason: 'рядка виписки немає' };
  if (/Поповнення балансу/i.test(String(txn.comment ?? ''))) return { status: 'topup' };
  const m = classifyMonoTxn(txn.raw as unknown as MonoStatementItem);
  if (!m || m.kind !== 'acquiring') return { status: 'no-order', reason: 'не покриття еквайрингу' };

  let order: { id: string; order_number: number } | null = null;
  let by: 'number' | 'amount' = 'number';
  if (m.orderNumber && m.orderNumber <= PG_INT4_MAX) {
    const { data } = await db.from('orders').select('id, order_number').eq('order_number', m.orderNumber).maybeSingle();
    order = data ?? null;
  }
  if (!order) {
    by = 'amount';
    const until = String(txn.txn_time);
    const since = new Date(Date.parse(until) - 3 * 86400000).toISOString();
    const { data: cands } = await db.from('orders').select('id, order_number, total_price')
      .not('payment_reference', 'is', null).gte('created_at', since).lte('created_at', until).limit(200);
    const hit = (cands ?? []).filter(o => Math.abs(Number(o.total_price) - m.gross) < 0.01);
    if (hit.length !== 1) return { status: 'no-order', reason: hit.length ? `кілька карткових замовлень на ${m.gross} ₴` : `немає карткового замовлення на ${m.gross} ₴` };
    order = { id: hit[0].id as string, order_number: hit[0].order_number as number };
  }

  const ledger = await ledgerDealCost(db, 'acquiring_fee', monoTxnId);
  if (!ledger) return { status: 'no-ledger-fee' };
  if (!(ledger.amount > 0)) return { status: 'zero-fee' };
  const res = await writeDealCostAllocation(db, {
    source: 'acquiring_fee', monoTxnId, method: 'payment', dryRun: opts.dryRun,
    allocs: [{ orderId: order.id, amount: ledger.amount, meta: { rows: [{ id: String(order.order_number), gross: m.gross, fee: ledger.amount }] } }],
  });
  if (res.status !== 'written') return res;
  return { status: 'written', orderNumber: order.order_number, amount: res.allocated, by };
}

/** Сума розбитих витрат по кожному замовленню. */
export async function loadOrderDealCosts(db: Db, orderIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!orderIds.length) return out;
  const rows = (await Promise.all(chunk(orderIds, CHUNK).map(c => fetchAllRows<{ order_id: string; amount: number }>((f, t) => db
    .from('order_deal_costs').select('order_id, amount')
    .in('order_id', c).order('id').range(f, t))))).flat();
  for (const r of rows) out.set(r.order_id, r2((out.get(r.order_id) ?? 0) + Number(r.amount)));
  return out;
}

/** Скільки з проведених за період витрат «без замовлення» вже рознесено (за датою проводки). */
export async function sumDealCostsByDate(db: Db, fromYmd: string, toYmdExclusive: string | null): Promise<number> {
  const rows = await fetchAllRows<{ amount: number }>((f, t) => {
    let q = db.from('order_deal_costs').select('amount').gte('business_date', fromYmd);
    if (toYmdExclusive) q = q.lt('business_date', toYmdExclusive);
    return q.order('id').range(f, t);
  });
  return r2(rows.reduce((s, r) => s + Number(r.amount), 0));
}

export type DealCostMismatch = { sourceRef: string; allocated: number; ledger: number | null };

/**
 * Інваріант розбивки: по кожному переказу рознесено не більше, ніж проведено
 * винагороди в леджері (і проводка взагалі існує). Порушення = розбивка
 * розійшлась з обліком — прибуток по замовленнях занижено. Ганяє check-invariants.
 */
export async function findDealCostMismatches(db: Db): Promise<DealCostMismatch[]> {
  const out: DealCostMismatch[] = [];
  for (const source of Object.keys(LEDGER_KEY_PREFIX) as DealCostSource[]) {
    const prefix = LEDGER_KEY_PREFIX[source];
    const [alloc, fees] = await Promise.all([
      fetchAllRows<{ source_ref: string; amount: number }>((f, t) => db
        .from('order_deal_costs').select('source_ref, amount').eq('source', source).order('id').range(f, t)),
      fetchAllRows<{ idempotency_key: string | null; amount: number }>((f, t) => db
        .from('money_entries').select('idempotency_key, amount').like('idempotency_key', `${prefix}%`).order('id').range(f, t)),
    ]);
    const ledger = new Map(fees.map(r => [String(r.idempotency_key).slice(prefix.length), r2(Number(r.amount))]));
    const byRef = new Map<string, number>();
    for (const a of alloc) byRef.set(a.source_ref, r2((byRef.get(a.source_ref) ?? 0) + Number(a.amount)));
    for (const [ref, allocated] of byRef) {
      const l = ledger.get(ref) ?? null;
      if (l == null || allocated > l + 0.01) out.push({ sourceRef: `${DEAL_COST_LABEL[source]} ${ref}`, allocated, ledger: l });
    }
  }
  return out;
}

/** Замовлення, оплату за яке виплачує RozetkaPay: передоплата Prom/Rozetka і наложка перевізником Rozetka. */
export function paidViaRzPay(order: SalePartyOrder): boolean {
  const party = saleDebitPartyFor(order);
  return party === SALE_DEBTOR.prom || party === SALE_DEBTOR.rozetka;
}

/** Середня ставка RozetkaPay за 90 днів (Σ винагород / Σ брутто переказів) — для прогнозу. */
export async function loadRzPayRate(db: Db): Promise<number | null> {
  const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const { data } = await db.from('money_entries')
    .select('amount, meta')
    .like('idempotency_key', 'rzpay-fee:%')
    .gte('business_date', since)
    .limit(1000);
  return rzPayRate((data ?? []).map(r => {
    const m = (r.meta ?? {}) as { rzpay?: { gross?: number } };
    return { fee: Number(r.amount), gross: Number(m.rzpay?.gross ?? 0) };
  }));
}
