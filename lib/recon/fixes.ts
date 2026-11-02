import { createServiceClient } from '../supabase';
import { recordTxn } from '../accounting/money';
import { logAgentRun } from '../ai-agent-runs';
import { refreshNovapayBalance } from '../novapay-api';
import { ingestNovapayStatement, postNpPayouts } from '../novapay-ingest';
import { postNovapayAutoTopups } from '../novapay-autopost';
import { postNovapayRow } from '../novapay-post';
import { findGapLine, fmtUah, npCategoryLabel, suggestNovapayCategory, type NpHistoryRow, type ReconFix, type SaleLine } from './rules';

/**
 * Агент звірки, етап 2: виправлення в один клік. Агент лише ПРОПОНУЄ — проводить
 * людина кнопкою на /admin/digest. Кожна пропозиція має самодостатній id; при
 * натисканні сервер заново збирає її з БД (суму клієнта не беремо), перевіряє, що
 * вона ще актуальна, і проводить з ідемпотентним ключем — повторне натискання
 * нічого не дублює. Кожне застосування — рядок ai_agent_runs agent=mp_recon_fix.
 *
 * Що вміє:
 *  • np-refresh — оновити виписку НоваПей (те саме, що кнопка на екрані «НоваПей»):
 *    знімає «розходження», коли виписка відстає від живого залишку (02.11: виплати
 *    01.11 у залишку вже були, у виписці — ще ні);
 *  • np:<id>:<категорія> — нерозібране списання, яке ВСІ попередні документи того
 *    самого контрагента проведено однією категорією (ФОП Равло → вивід власника);
 *  • not-shipped:<№>:<sku>:<к-сть> — НоваПей виплатила менше наложки рівно на ціну
 *    дропшип-позиції: її не було в посилці (02.11: №26101198, Siltek 100 ₴).
 */

export const RECON_FIX_AGENT = 'mp_recon_fix';
type Db = ReturnType<typeof createServiceClient>;
type NpRow = { id: string; txn_date: string; amount: number; direction: string; counterparty: string | null; purpose: string | null; status: string };

async function npHistory(db: Db): Promise<NpHistoryRow[]> {
  const { data } = await db.from('novapay_txns').select('counterparty, direction, category')
    .eq('status', 'posted').not('category', 'is', null).neq('kind', 'cod_payout')
    .order('id', { ascending: false }).limit(2000);
  return (data ?? []) as NpHistoryRow[];
}

async function supplierNames(db: Db, cats: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(cats.filter(c => c.startsWith('supplier:')).map(c => c.slice(9)))];
  if (!ids.length) return new Map();
  const { data } = await db.from('suppliers').select('id, name').in('id', ids).limit(100);
  return new Map((data ?? []).map(s => [String(s.id), String(s.name)]));
}

/** Нерозібрані рядки НоваПей з однозначним прецедентом. */
export async function novapayFixes(db: Db): Promise<ReconFix[]> {
  const { data: rows } = await db.from('novapay_txns').select('id, txn_date, amount, direction, counterparty, purpose, status')
    .eq('status', 'unmatched').order('txn_date').order('id').limit(100);
  if (!rows?.length) return [];
  const history = await npHistory(db);
  const props = (rows as NpRow[]).map(r => ({ r, s: suggestNovapayCategory(r, history) })).filter(x => x.s);
  const names = await supplierNames(db, props.map(x => x.s!.category));
  return props.map(({ r, s }) => ({
    id: `np:${r.id}:${s!.category}`,
    label: `Провести як «${npCategoryLabel(s!.category, names.get(s!.category.slice(9)))}»`,
    detail: `${r.txn_date} · ${r.counterparty ?? '—'} · ${r.purpose ?? ''} — так проведено всі ${s!.count} попередні документи цього контрагента`,
    amount: Number(r.amount),
  }));
}

export const NP_REFRESH_FIX: ReconFix = {
  id: 'np-refresh', label: 'Оновити виписку НоваПей і звірити знову',
  detail: 'Підтягне свіжі документи, проведе виплати наложки й автопоповнення за звичними правилами', amount: null,
};

type CodGap = { orderId: string; orderNumber: number; gap: number; deliveredDate: string; line: SaleLine; qty: number };

/** Позиція, на яку НоваПей недоплатила наложку, — для одного замовлення. */
async function codGapFor(db: Db, orderId: string, net: number): Promise<CodGap | null> {
  const { data: entries } = await db.from('money_entries').select('doc_type, doc_id, amount, meta, business_date')
    .eq('order_id', orderId).eq('account_type', 'customer').eq('counterparty_id', 'np:cod').order('id').limit(50);
  const list = entries ?? [];
  // Лише коли виплата вже була (часткова) — інакше це просто «ще не виплатили»
  const paid = list.some(e => e.doc_type === 'payment' && Number(e.amount) < 0);
  const shipment = list.find(e => e.doc_type === 'sale' && Number(e.amount) > 0 && e.doc_id);
  if (!paid || !shipment) return null;
  const { data: o } = await db.from('orders').select('order_number, delivered_at').eq('id', orderId).maybeSingle();
  if (!o?.delivered_at) return null;
  const { data: lines } = await db.from('acc_document_lines').select('sku, qty, price, cost_price, supplier_id, fulfillment_type')
    .eq('document_id', shipment.doc_id!).order('sort_order').limit(200);
  const hit = findGapLine(Math.round(net * 100) / 100, (lines ?? []).map(l => ({ ...l, qty: Number(l.qty), price: Number(l.price), cost_price: l.cost_price == null ? null : Number(l.cost_price) })) as SaleLine[]);
  if (!hit) return null;
  return { orderId, orderNumber: o.order_number, gap: Math.round(net * 100) / 100, deliveredDate: String(o.delivered_at).slice(0, 10), ...hit };
}

export async function codGapFixes(db: Db, open: { orderId: string; net: number }[]): Promise<ReconFix[]> {
  const out: ReconFix[] = [];
  for (const i of open.slice(0, 20)) {
    const g = await codGapFor(db, i.orderId, i.net);
    if (!g) continue;
    const { data: p } = await db.from('products').select('name').eq('sku', g.line.sku).maybeSingle();
    out.push({
      id: `not-shipped:${g.orderNumber}:${g.line.sku}:${g.qty}`,
      label: `№${g.orderNumber}: «${p?.name ?? g.line.sku}» не відправили`,
      detail: `НоваПей недоплатила рівно ${fmtUah(g.gap)} — це ${g.qty} шт × ${fmtUah(g.line.price)}. Виручка −${fmtUah(g.gap)}, борг постачальнику й собівартість −${fmtUah(g.qty * Number(g.line.cost_price))}`,
      amount: g.gap,
    });
  }
  return out;
}

export type FixResult = { ok: boolean; message: string; txnIds: string[] };

async function applyNotShipped(db: Db, num: number, sku: string, qty: number, by: string): Promise<FixResult> {
  const { data: o } = await db.from('orders').select('id').eq('order_number', num).maybeSingle();
  if (!o) return { ok: false, message: `Замовлення №${num} не знайдено`, txnIds: [] };
  const { data: cod } = await db.from('money_entries').select('amount')
    .eq('order_id', o.id).eq('account_type', 'customer').eq('counterparty_id', 'np:cod').order('id').limit(100);
  const net = Math.round((cod ?? []).reduce((s, r) => s + Number(r.amount), 0) * 100) / 100;
  const g = await codGapFor(db, o.id, net);
  if (!g || g.line.sku !== sku || g.qty !== qty) return { ok: false, message: `Пропозиція вже неактуальна: по №${num} до виплати ${fmtUah(net)}`, txnIds: [] };
  const cost = Math.round(qty * Number(g.line.cost_price) * 100) / 100;
  const meta = { kind: 'item_not_shipped', sku, qty, confirmed_by: by, source: 'mp_recon_fix' };
  const rev = await recordTxn({ debitAccount: 'revenue', creditAccount: 'customer', creditParty: 'np:cod', amount: g.gap,
    businessDate: g.deliveredDate, docType: 'sale', orderId: o.id,
    description: `Не відправлено: ${sku} × ${qty} — у посилці не було, НоваПей недоплатила ${fmtUah(g.gap)} (замовлення #${num})`,
    idempotencyKey: `not-shipped:${num}:${sku}:revenue`, createdBy: by, meta });
  const ids = [rev];
  if (cost > 0) {
    ids.push(await recordTxn({ debitAccount: 'supplier', debitParty: String(g.line.supplier_id), creditAccount: 'cogs', amount: cost,
      businessDate: g.deliveredDate, docType: 'cogs', orderId: o.id,
      description: `Не відправлено: ${sku} × ${qty} — постачальник не відвантажив, борг і собівартість знято (замовлення #${num})`,
      idempotencyKey: `not-shipped:${num}:${sku}:cogs`, createdBy: by, meta }));
  }
  return { ok: true, message: `№${num}: виручка −${fmtUah(g.gap)}, борг постачальнику −${fmtUah(cost)}`, txnIds: ids };
}

async function applyNovapayRow(db: Db, rowId: string, category: string, by: string): Promise<FixResult> {
  const { data: row } = await db.from('novapay_txns').select('id, txn_date, amount, direction, counterparty, purpose, status').eq('id', rowId).maybeSingle();
  if (!row) return { ok: false, message: 'Документ виписки не знайдено', txnIds: [] };
  if (row.status !== 'unmatched') return { ok: false, message: 'Документ уже розібрано', txnIds: [] };
  const s = suggestNovapayCategory(row as NpRow, await npHistory(db));
  if (s?.category !== category) return { ok: false, message: 'Пропозиція вже неактуальна — розберіть на екрані «НоваПей»', txnIds: [] };
  const description = category === 'owner' ? `Особисті витрати: ${row.purpose ?? ''} — ${row.counterparty ?? ''}` : null;
  const txnId = await postNovapayRow(row as NpRow, { category, description, by });
  return { ok: true, message: `НоваПей ${row.txn_date}: ${fmtUah(Number(row.amount))} проведено як «${npCategoryLabel(category)}»`, txnIds: [txnId] };
}

async function applyNpRefresh(by: string): Promise<FixResult> {
  const ingest = await ingestNovapayStatement(14);
  const payouts = await postNpPayouts(by);
  const autopost = await postNovapayAutoTopups(`autopost:${by}`);
  await refreshNovapayBalance();
  return { ok: true, message: `Виписку оновлено: ${JSON.stringify({ ingest, payouts, autopost }).slice(0, 300)}`, txnIds: [] };
}

/** Застосувати пропозицію за id. Кидає лише на збоях БД/API; «неактуально» — ok:false. */
export async function applyReconFix(id: string, by: string): Promise<FixResult> {
  const started = Date.now();
  const db = createServiceClient();
  let res: FixResult;
  let err: string | null = null;
  try {
    const parts = id.split(':');
    if (id === 'np-refresh') res = await applyNpRefresh(by);
    else if (parts[0] === 'np' && parts.length >= 3) res = await applyNovapayRow(db, parts[1], parts.slice(2).join(':'), by);
    else if (parts[0] === 'not-shipped' && parts.length === 4 && Number(parts[1]) > 0 && Number(parts[3]) > 0) res = await applyNotShipped(db, Number(parts[1]), parts[2], Number(parts[3]), by);
    else res = { ok: false, message: 'Невідома пропозиція', txnIds: [] };
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
    res = { ok: false, message: err, txnIds: [] };
  }
  await logAgentRun({
    agent: RECON_FIX_AGENT, input: { id }, output: { ...res },
    model: 'none', costUsd: 0, inputTokens: 0, outputTokens: 0, toolCalls: 0,
    durationMs: Date.now() - started, error: err, createdBy: by,
  });
  return res;
}
