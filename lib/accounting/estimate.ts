/**
 * Прогноз валового прибутку по замовленнях — єдиний DB-шар для «Огляду»,
 * «Аналітики» й звірки «прогноз vs факт». Правила — estimate-rules.ts.
 *
 * Що читає: рядки з order_lines, поточну закупівельну з product_stock, факт із
 * money_entries (виручка, COGS, комісія площадки, еквайринг/збори НП), оцінку комісії —
 * з lib/marketplace/fees (той самий оцінювач, що й при проведенні РН), винагороду
 * RozetkaPay по замовленню — з order_deal_costs (lib/deal-costs, міграція 158).
 */
import { createServiceClient } from '../supabase-service';
import { fetchAllRows } from '../db-paginate';
import { loadOrderLines, type OrderLine } from '../orders/lines-read';
import { isMarketplace, estimateChannelCommissionPerItem, estimateOrderLevelFees, type OrderForLevelFees } from '../marketplace/fees';
import type { MarketplaceCode } from '../marketplace/adapter';
import { classifyPLEntry } from './profit-rules';
import { estimateOrderProfit, summarizeDrift, type DriftRow, type DriftSummary, type LineEstimate, type OrderFact, type ProfitEstimate } from './estimate-rules';
import { loadOrderDealCosts, loadRzPayRate, paidViaRzPay } from '../deal-costs';

type Db = ReturnType<typeof createServiceClient>;

export type EstimateOrder = { id: string; channel_code: string | null; total_price: number | null };

const SKU_CHUNK = 200;
const ORDER_CHUNK = 150;

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/**
 * Прогноз по набору замовлень → Map<order_id, ProfitEstimate>. Рядки можна
 * передати готовими (якщо екран уже завантажив order_lines), інакше читаються тут.
 */
export async function loadProfitEstimates(
  db: Db,
  orders: EstimateOrder[],
  opts: {
    lines?: Map<string, OrderLine[]>;
    /**
     * Звідки брати закупівельну рядка: 'missing-fact' (типово) — з рядків РН лише
     * для замовлень без факту COGS (відвантажені, не вручені); 'all' — для всіх, що
     * мають РН: тоді для вручених рядок несе собівартість з накладної, і розрізи по
     * SKU/бренду/категорії («Аналітика») рахуються з того самого числа, що й леджер,
     * а не з поточної price_cost чи середньої за півроку.
     */
    docCost?: 'missing-fact' | 'all';
  } = {},
): Promise<Map<string, ProfitEstimate>> {
  const byId = new Map(orders.map(o => [o.id, o]));
  const ids = [...byId.keys()];
  if (ids.length === 0) return new Map();

  const lines = opts.lines ?? await loadOrderLines(db, ids);
  const skus = [...new Set(ids.flatMap(id => (lines.get(id) ?? []).map(l => l.sku)))];

  const [costRows, factRows, dealCosts, rzPayRate] = await Promise.all([
    Promise.all(chunk(skus, SKU_CHUNK).map(c => db.from('product_stock').select('sku, price_cost').in('sku', c).limit(SKU_CHUNK).then(r => r.data ?? []))).then(a => a.flat()),
    Promise.all(chunk(ids, ORDER_CHUNK).map(c => fetchAllRows<{ order_id: string | null; account_type: string; doc_type: string | null; amount: number }>((f, t) => db
      .from('money_entries')
      .select('order_id, account_type, doc_type, amount')
      .in('account_type', ['revenue', 'cogs', 'marketplace_fee', 'acquiring_fee', 'logistics'])
      .in('order_id', c)
      .order('id').range(f, t)))).then(a => a.flat()),
    // Винагорода RozetkaPay по замовленнях (у леджері — без order_id, розбивка в order_deal_costs)
    loadOrderDealCosts(db, ids),
    loadRzPayRate(db),
  ]);

  // Закупівельна: null, якщо немає рядка або ціна порожня/0 (0 — це «невідомо», не «безкоштовно»)
  const costBySku = new Map<string, number | null>();
  for (const r of costRows) {
    const v = Number(r.price_cost);
    costBySku.set(r.sku as string, Number.isFinite(v) && v > 0 ? v : null);
  }

  const facts = new Map<string, OrderFact>();
  for (const e of factRows) {
    if (!e.order_id) continue;
    const f = facts.get(e.order_id) ?? { cogs: null, fee: null, dealExtra: 0 };
    const amt = Number(e.amount);
    if (e.account_type === 'revenue') f.revenue = (f.revenue ?? 0) - amt;   // кредит → +виручка
    else if (e.account_type === 'cogs') f.cogs = (f.cogs ?? 0) + amt;
    else if (e.account_type === 'marketplace_fee') f.fee = (f.fee ?? 0) + amt;
    else if (classifyPLEntry(e.account_type, e.doc_type) === 'deal') f.dealExtra += amt;
    facts.set(e.order_id, f);
  }

  // Відвантажені, але ще не вручені: у рядках РН-чернетки вже лежить закупівельна
  // на момент відвантаження (саме вона й проведеться в COGS для дропшипу) — вона
  // точніша за поточну price_cost. Читаємо лише для замовлень без факту COGS.
  const docCost = new Map<string, Map<string, { cost: number; qty: number }>>();
  const noFactIds = opts.docCost === 'all' ? ids : ids.filter(id => facts.get(id)?.cogs == null);
  if (noFactIds.length) {
    const docs = (await Promise.all(chunk(noFactIds, ORDER_CHUNK).map(c => db
      .from('acc_documents').select('id, order_id')
      .eq('doc_type', 'sale').in('status', ['draft', 'confirmed']).is('reversal_of', null)
      .in('order_id', c).limit(ORDER_CHUNK * 4)
      .then(r => r.data ?? [])))).flat();
    const orderByDoc = new Map(docs.map(d => [d.id as string, d.order_id as string]));
    const docLines = (await Promise.all(chunk([...orderByDoc.keys()], ORDER_CHUNK).map(c => fetchAllRows<{ document_id: string; sku: string; qty: number; cost_price: number | null }>((f, t) => db
      .from('acc_document_lines').select('document_id, sku, qty, cost_price')
      .in('document_id', c).order('id').range(f, t))))).flat();
    for (const l of docLines) {
      const cost = Number(l.cost_price);
      if (!(cost > 0)) continue;
      const orderId = orderByDoc.get(l.document_id)!;
      const m = docCost.get(orderId) ?? new Map<string, { cost: number; qty: number }>();
      const a = m.get(l.sku) ?? { cost: 0, qty: 0 };
      a.cost += cost * Number(l.qty); a.qty += Number(l.qty);
      m.set(l.sku, a); docCost.set(orderId, m);
    }
  }

  // Комісія за ставками каналу — один батч на канал, результат зіставляється за індексом
  const lineEst = new Map<string, LineEstimate[]>();
  for (const id of ids) {
    lineEst.set(id, (lines.get(id) ?? []).map(l => {
      const d = docCost.get(id)?.get(l.sku);
      return {
        sku: l.sku, qty: l.qty, price: l.price,
        unitCost: d && d.qty > 0 ? Math.round((d.cost / d.qty) * 100) / 100 : (costBySku.get(l.sku) ?? null),
        fee: 0,
      };
    }));
  }
  const byChannel = new Map<MarketplaceCode, { id: string; idx: number }[]>();
  for (const id of ids) {
    const ch = byId.get(id)!.channel_code;
    if (!isMarketplace(ch)) continue;
    const arr = byChannel.get(ch) ?? [];
    lineEst.get(id)!.forEach((_, idx) => arr.push({ id, idx }));
    byChannel.set(ch, arr);
  }
  for (const [mp, refs] of byChannel) {
    const items = refs.map(r => { const l = lineEst.get(r.id)![r.idx]; return { sku: l.sku, name: '', brand: '', qty: l.qty, price: l.price }; });
    const fees = await estimateChannelCommissionPerItem(db, mp, items);
    refs.forEach((r, i) => { lineEst.get(r.id)![r.idx].fee = fees[i] ?? 0; });
  }

  // Збори рівня замовлення (Smart, видача Rozetka Доставки, «Дешева доставка» Prom):
  // потрібні лише поля payload, читаємо їх точково, а не весь jsonb
  // payment_type/delivery_type — ще й для всіх замовлень: через RozetkaPay платять
  // і замовлення сайту з наложкою перевізником Rozetka (rz_delivery)
  type ExtraRow = Omit<OrderForLevelFees, 'channel_code' | 'total_price'> & { payment_type: string | null };
  const extraRows = (await Promise.all(chunk(ids, ORDER_CHUNK).map(c => db
    .from('orders')
    .select('id, delivery_type, payment_type, is_smart:rozetka_data->is_smart, ps_promotion:prom_data->ps_promotion, rz_delivery_price:rozetka_data->_rz_delivery_price')
    .in('id', c).limit(ORDER_CHUNK)
    .then(r => (r.data ?? []) as unknown as ExtraRow[])))).flat();
  const orderFees = await estimateOrderLevelFees(db, extraRows
    .filter(r => isMarketplace(byId.get(r.id)!.channel_code))
    .map(r => ({
      ...r, channel_code: byId.get(r.id)!.channel_code, total_price: byId.get(r.id)!.total_price,
    })));
  const extraById = new Map(extraRows.map(r => [r.id, r]));

  const out = new Map<string, ProfitEstimate>();
  for (const id of ids) {
    const o = byId.get(id)!;
    const fact = facts.get(id);
    // Винагорода RozetkaPay: факт із розбивки виплати, інакше — оцінка за
    // середньою ставкою для замовлень, які виплачує RozetkaPay (ще не виплачені)
    const factPay = dealCosts.get(id);
    const x = extraById.get(id);
    let paymentFee: { amount: number; source: 'fact' | 'estimate' } | null = null;
    if (factPay != null) paymentFee = { amount: factPay, source: 'fact' };
    else if (rzPayRate && x && paidViaRzPay({ channel_code: o.channel_code, payment_type: x.payment_type, delivery_type: x.delivery_type })) {
      const base = fact?.revenue != null ? fact.revenue : Number(o.total_price ?? 0);
      paymentFee = { amount: Math.round(base * rzPayRate * 100) / 100, source: 'estimate' };
    }
    out.set(id, estimateOrderProfit(Number(o.total_price ?? 0), lineEst.get(id)!, fact, orderFees.get(id) ?? 0, paymentFee));
  }
  return out;
}

/**
 * Дрейф прогнозу: по вручених за останні `days` днів замовленнях із фактом у
 * леджері порівнюємо чисту оцінку (ставки + поточна закупівля) з фактом.
 * Запускається з крону check-invariants; поріг — estimate-rules.DRIFT_PCT.
 */
export async function profitEstimateDrift(db: Db, days = 30): Promise<DriftSummary> {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const orders = await fetchAllRows<{ id: string; order_number: number | null; channel_code: string | null; total_price: number | null }>((f, t) => db
    .from('orders')
    .select('id, order_number, channel_code, total_price')
    .eq('status', 'delivered')
    .gte('delivered_at', since)
    .order('id').range(f, t));
  const est = await loadProfitEstimates(db, orders);
  const rows: DriftRow[] = [];
  for (const o of orders) {
    const e = est.get(o.id);
    if (!e || e.cogsSource !== 'fact') continue;
    // Однакові складові з обох боків: dealExtra (еквайринг, збори НП) і винагорода
    // RozetkaPay у чисту оцінку не входять — тож і з факту їх прибираємо
    rows.push({
      orderNumber: o.order_number, revenue: e.revenue,
      estGross: e.estimated.gross, factGross: e.gross + e.dealExtra + e.paymentFee,
      estCogs: e.estimated.cogs, factCogs: e.cogs, estFee: e.estimated.fee, factFee: e.fee,
    });
  }
  return summarizeDrift(rows);
}
