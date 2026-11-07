/**
 * Розбивка проведених без замовлення витрат угоди по замовленнях — запис і
 * читання таблиці order_deal_costs (міграція 158). Правила — lib/deal-costs-rules.
 *
 * ЄДИНЕ місце, що пише в order_deal_costs: writeRzPayFeeAllocation (викликає
 * розбір реєстру RozetkaPay — і з пошти, і з ручного завантаження, — та разовий
 * перерахунок історії scripts/backfill-rzpay-fees.ts). Леджер не змінюється.
 */
import { createServiceClient, asJson } from './supabase-service';
import { fetchAllRows } from './db-paginate';
import { capToLedger, rzPayRate, type FeeAllocation } from './deal-costs-rules';
import { saleDebitPartyFor, SALE_DEBTOR, type SalePartyOrder } from './accounting/sale-party';

type Db = ReturnType<typeof createServiceClient>;
const r2 = (n: number) => Math.round(n * 100) / 100;
const CHUNK = 200;   // id у URL запиту: на ~400+ UUID PostgREST відповідає «Bad Request»

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** Проведена винагорода RozetkaPay по переказу (ключ rzpay-fee:{txn}); null — ще не проведена. */
export async function ledgerRzPayFee(db: Db, monoTxnId: string): Promise<{ amount: number; businessDate: string } | null> {
  const { data } = await db.from('money_entries')
    .select('amount, business_date')
    .eq('idempotency_key', `rzpay-fee:${monoTxnId}`)
    .limit(1).maybeSingle();
  if (!data) return null;
  return { amount: r2(Number(data.amount)), businessDate: String(data.business_date) };
}

export type RzPayFeeWriteResult =
  | { status: 'written'; allocated: number; ledgerFee: number; orders: number; capped: boolean }
  | { status: 'no-ledger-fee' }      // переказ є, а проводки винагороди ще немає — повторити пізніше
  | { status: 'zero-fee' };          // переказ без винагороди — розбивати нічого

/**
 * Атомарно замінює розбивку винагороди одного переказу. Розбивка обмежується
 * проведеною сумою; решта лишається «без замовлення».
 */
export async function writeRzPayFeeAllocation(db: Db, params: {
  monoTxnId: string; allocs: FeeAllocation[]; method: 'register' | 'proportional'; dryRun?: boolean;
}): Promise<RzPayFeeWriteResult> {
  const ledger = await ledgerRzPayFee(db, params.monoTxnId);
  if (!ledger) return { status: 'no-ledger-fee' };
  if (!(ledger.amount > 0)) return { status: 'zero-fee' };
  const { allocs, capped } = capToLedger(params.allocs, ledger.amount);
  const allocated = r2(allocs.reduce((s, a) => s + a.amount, 0));
  if (!params.dryRun) {
    const { error } = await db.rpc('replace_order_deal_costs', {
      p_source: 'rzpay_fee', p_ref: params.monoTxnId, p_business_date: ledger.businessDate, p_method: params.method,
      p_rows: asJson(allocs.map(a => ({ order_id: a.orderId, amount: a.amount, meta: a.meta }))),
    });
    if (error) throw error;
  }
  return { status: 'written', allocated, ledgerFee: ledger.amount, orders: allocs.length, capped };
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
  const [alloc, fees] = await Promise.all([
    fetchAllRows<{ source_ref: string; amount: number }>((f, t) => db
      .from('order_deal_costs').select('source_ref, amount').eq('source', 'rzpay_fee').order('id').range(f, t)),
    fetchAllRows<{ idempotency_key: string | null; amount: number }>((f, t) => db
      .from('money_entries').select('idempotency_key, amount').like('idempotency_key', 'rzpay-fee:%').order('id').range(f, t)),
  ]);
  const ledger = new Map(fees.map(r => [String(r.idempotency_key).slice('rzpay-fee:'.length), r2(Number(r.amount))]));
  const byRef = new Map<string, number>();
  for (const a of alloc) byRef.set(a.source_ref, r2((byRef.get(a.source_ref) ?? 0) + Number(a.amount)));
  const out: DealCostMismatch[] = [];
  for (const [ref, allocated] of byRef) {
    const l = ledger.get(ref) ?? null;
    if (l == null || allocated > l + 0.01) out.push({ sourceRef: ref, allocated, ledger: l });
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
