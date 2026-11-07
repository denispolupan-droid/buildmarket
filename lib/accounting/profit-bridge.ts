/**
 * Міст «замовлення періоду → облік» — завантаження. Один і той самий для
 * «Огляду» й «Аналітики» (правила — profit-bridge-rules.ts).
 */
import { createServiceClient } from '../supabase-service';
import { fetchAllRows } from '../db-paginate';
import { buildProfitBridge, entryEffect, type BridgeCohortOrder, type BridgeEntry, type BridgeOtherOrder, type ProfitBridge } from './profit-bridge-rules';

type Db = ReturnType<typeof createServiceClient>;
const ACCOUNTS = ['revenue', 'cogs', 'marketplace_fee', 'acquiring_fee', 'logistics'];
const CHUNK = 200;   // id у URL запиту: на ~400+ UUID PostgREST відповідає «Bad Request»

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

type Row = { order_id: string | null; account_type: string; doc_type: string | null; amount: number; business_date: string };

export async function loadProfitBridge(db: Db, params: {
  /** межі за датою проводки (київська дата), toYmd — виключно; null — до сьогодні */
  fromYmd: string; toYmd: string | null;
  /** межа створення замовлень (для «створені раніше») */
  fromIso: string;
  cohort: BridgeCohortOrder[];
}): Promise<ProfitBridge> {
  const { fromYmd, toYmd, fromIso, cohort } = params;
  const inPeriod = (d: string) => d >= fromYmd && (!toYmd || d < toYmd);
  const factIds = cohort.filter(o => o.hasFact).map(o => o.id);

  const [periodRows, factRows, periodAlloc, factAlloc] = await Promise.all([
    fetchAllRows<Row>((f, t) => {
      let q = db.from('money_entries').select('order_id, account_type, doc_type, amount, business_date')
        .in('account_type', ACCOUNTS).gte('business_date', fromYmd);
      if (toYmd) q = q.lt('business_date', toYmd);
      return q.order('id').range(f, t);
    }),
    Promise.all(chunk(factIds, CHUNK).map(c => fetchAllRows<Row>((f, t) => db
      .from('money_entries').select('order_id, account_type, doc_type, amount, business_date')
      .in('account_type', ACCOUNTS).in('order_id', c).order('id').range(f, t)))).then(a => a.flat()),
    fetchAllRows<{ order_id: string; amount: number; business_date: string }>((f, t) => {
      let q = db.from('order_deal_costs').select('order_id, amount, business_date').gte('business_date', fromYmd);
      if (toYmd) q = q.lt('business_date', toYmd);
      return q.order('id').range(f, t);
    }),
    Promise.all(chunk(factIds, CHUNK).map(c => fetchAllRows<{ order_id: string; amount: number; business_date: string }>((f, t) => db
      .from('order_deal_costs').select('order_id, amount, business_date').in('order_id', c).order('id').range(f, t)))).then(a => a.flat()),
  ]);

  const entries: BridgeEntry[] = [];
  const push = (r: Row, inP: boolean) => {
    const e = entryEffect(r.account_type, r.doc_type, Number(r.amount));
    if (e) entries.push({ orderId: r.order_id, inPeriod: inP, ...e });
  };
  for (const r of periodRows) push(r, true);
  // Проводки вручених замовлень когорти поза періодом (у періоді — уже вище)
  for (const r of factRows) if (!inPeriod(String(r.business_date))) push(r, false);
  // Винагорода RozetkaPay: у леджері без замовлення → переносимо рознесене на
  // замовлення (та сама дата), «без замовлення» зменшуємо на ту саму суму
  for (const a of periodAlloc) {
    entries.push({ orderId: a.order_id, inPeriod: true, rev: 0, profit: -Number(a.amount) });
    entries.push({ orderId: null, inPeriod: true, rev: 0, profit: Number(a.amount) });
  }
  for (const a of factAlloc) if (!inPeriod(String(a.business_date))) {
    entries.push({ orderId: a.order_id, inPeriod: false, rev: 0, profit: -Number(a.amount) });
  }

  // Замовлення поза когортою з проводками в періоді — створені раніше / скасовані
  const cohortIds = new Set(cohort.map(o => o.id));
  const otherIds = [...new Set(entries.filter(e => e.inPeriod && e.orderId && !cohortIds.has(e.orderId)).map(e => e.orderId!))];
  const otherRows = (await Promise.all(chunk(otherIds, CHUNK).map(c => db
    .from('orders').select('id, status, created_at').in('id', c).limit(CHUNK)
    .then(r => r.data ?? [])))).flat();
  const others: BridgeOtherOrder[] = otherRows.map(o => ({
    id: o.id as string,
    group: o.status === 'cancelled' ? 'cancelled' : String(o.created_at) < fromIso ? 'earlier' : 'other',
  }));

  return buildProfitBridge({ cohort, entries, others });
}
