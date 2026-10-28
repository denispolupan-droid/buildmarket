import { createServiceClient } from '../supabase';
import { fetchAllRows } from '../db-paginate';
import { logAgentRun } from '../ai-agent-runs';
import { sendTelegramResult } from '../telegram';
import { alertAdmin } from '../alert';
import { SITE_URL } from '../site';
import { getMonoLiveBalance } from '../mono-balance';
import { getNovapayLiveBalance } from '../novapay-api';
import { getEpicentrBillingInvoice } from '../epicentr-api';
import { openItemsByOrder } from '../accounting/mutual-settlements';
import { reconcileRozetka } from './rozetka';
import { balanceFinding, fmtUah, payoutFinding, renderReconHtml, MONEY_EPS, type ReconFinding } from './rules';

/**
 * Агент звірки з маркетплейсами й грошовими рахунками (тижневий, етап 1 — лише читання).
 *
 * Що звіряє:
 *  • Rozetka — та сама звірка, що на екрані «Маркетплейси» (lib/recon/rozetka):
 *    залишок кабінету проти обліку + розбіжності комісії по замовленнях за 30 днів;
 *  • Епіцентр — комісія з рахунку білінгу проти проведеної (поки замовлень немає);
 *  • банк Mono й НоваПей — живий залишок проти обліку;
 *  • виплати площадок і наложки — відкриті позиції старші за норму (як «Що не закрито»).
 * Prom API балансу не має — його звіряють вставкою виписки на екрані, тут лише нагадування.
 *
 * Кожна знахідка має стабільний key; минулий запуск (ai_agent_runs, agent=mp_recon)
 * дає динаміку: нове/зросле — червоне, стабільне — жовте.
 */

export const RECON_AGENT = 'mp_recon';
/** Перші операції в кабінеті Rozetka — 16.07.2026; звіряємо всю історію з цієї дати. */
const ROZETKA_SINCE = '2026-07-01';
const SPECIAL_PAYOUTS: { id: string; label: string }[] = [
  { id: 'np:cod', label: 'Наложка НоваПей' },
  { id: 'mp:rozetka', label: 'Виплати Rozetka' },
  { id: 'mp:prom', label: 'Виплати Prom' },
  { id: 'mp:epicentr', label: 'Виплати Епіцентр' },
];

type Db = ReturnType<typeof createServiceClient>;

async function previousDeltas(db: Db): Promise<Map<string, number>> {
  const { data } = await db.from('ai_agent_runs').select('output').eq('agent', RECON_AGENT).is('error', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  const list = ((data?.output as { findings?: ReconFinding[] } | null)?.findings ?? []);
  return new Map(list.filter(f => typeof f.delta === 'number').map(f => [f.key, f.delta as number]));
}

const ledgerSum = async (db: Db, account: string, counterparty?: string) => {
  const rows = await fetchAllRows<{ amount: number }>((f, t) => {
    let q = db.from('money_entries').select('amount').eq('account_type', account);
    q = counterparty ? q.eq('counterparty_id', counterparty) : q.is('counterparty_id', null);
    return q.order('id').range(f, t);
  });
  return rows.reduce((s, r) => s + Number(r.amount), 0);
};

async function rozetkaFindings(prev: Map<string, number>, now: Date): Promise<ReconFinding[]> {
  // Уся історія з початку роботи на Rozetka, а не 30 днів: інакше списання,
  // що випало за край вікна, проти нашого свіжого уточнення комісії давало
  // фантомне «Rozetka не списала» (перший прогін 28.10: 21 серпневе замовлення).
  const to = now.toISOString().slice(0, 10);
  const r = await reconcileRozetka(ROZETKA_SINCE, to);
  const out: ReconFinding[] = [balanceFinding({
    key: 'rozetka:balance', area: 'Rozetka, залишок кабінету',
    ours: r.balanceCheck.ours, theirs: r.balanceCheck.cabinetTotal, theirsLabel: 'кабінет (баланс + сіра зона)',
    previousDelta: prev.get('rozetka:balance') ?? null,
    note: 'Частину зборів Rozetka знімає без рядка у виписці (Smart тощо) — такі різниці проводяться як «Невидиме списання»',
  })];
  const bad = r.rows.filter(x => x.status === 'diff' || x.status === 'missing_ours' || x.status === 'missing_theirs');
  const sum = Math.round(bad.reduce((s, x) => s + x.delta, 0) * 100) / 100;
  const prevSum = prev.get('rozetka:commission');
  const changed = prevSum == null || Math.abs(sum - prevSum) >= MONEY_EPS;
  out.push({
    key: 'rozetka:commission', area: 'Rozetka, комісія по замовленнях (з липня)',
    level: bad.length ? (changed ? 'red' : 'yellow') : 'green',
    delta: sum,
    title: bad.length ? `${bad.length} замовлень розходяться (${fmtUah(sum)})` : `зійшлось по ${r.rows.length} замовленнях`,
    detail: `знак: + Rozetka списала більше, ніж ми провели; ${prevSum == null ? 'перший замір' : changed ? `минулого разу ${fmtUah(prevSum)}` : 'без змін з минулого тижня'}`,
    items: bad.slice(0, 8).map(x => `${x.orderNumber ? `№${x.orderNumber}` : `rz ${x.rozetkaOrderId}`}: Rozetka ${fmtUah(x.theirAmount)}, ми ${fmtUah(x.ourAmount)} — ${x.status === 'missing_ours' ? 'у нас комісії немає' : x.status === 'missing_theirs' ? 'Rozetka не списала' : 'різниця'}`),
  });
  const artBad = r.articles.filter(a => a.key !== 'commission' && Math.abs(a.delta) >= MONEY_EPS);
  if (artBad.length) {
    const artSum = Math.round(artBad.reduce((s, a) => s + a.delta, 0) * 100) / 100;
    const prevArt = prev.get('rozetka:articles');
    out.push({
      key: 'rozetka:articles', area: 'Rozetka, збори (з липня)',
      level: prevArt == null || Math.abs(artSum - prevArt) >= MONEY_EPS ? 'red' : 'yellow',
      delta: artSum,
      title: artBad.map(a => `${a.label}: ${fmtUah(a.delta)}`).join('; '),
      detail: 'знак: + ми провели більше, ніж Rozetka списала',
      items: artBad.filter(a => a.note).map(a => `${a.label}: ${a.note}`),
    });
  }
  return out;
}

async function epicentrFindings(db: Db, now: Date): Promise<ReconFinding[]> {
  const since = new Date(now.getTime() - 60 * 86_400_000).toISOString();
  const { data: orders } = await db.from('orders').select('id, order_number, epicentr_order_id')
    .eq('channel_code', 'epicentr').eq('status', 'delivered').gte('delivered_at', since).order('id').limit(200);
  if (!orders?.length) {
    return [{ key: 'epicentr:commission', area: 'Епіцентр, комісія', level: 'info', title: 'вручених замовлень за 60 днів немає — звіряти нічого', detail: '', items: [] }];
  }
  const { data: fees } = await db.from('money_entries').select('order_id, amount, description, meta')
    .eq('account_type', 'marketplace_fee').eq('counterparty_id', 'epicentr').in('order_id', orders.map(o => o.id)).limit(5000);
  const ours = new Map<string, number>();
  for (const f of fees ?? []) {
    const isCommission = /коміс/i.test(String(f.description ?? '')) && !(f.meta as { kind?: string } | null)?.kind;
    if (f.order_id && isCommission) ours.set(f.order_id, (ours.get(f.order_id) ?? 0) + Number(f.amount));
  }
  const diffs: string[] = [];
  let sum = 0;
  for (const o of orders) {
    if (!o.epicentr_order_id) continue;
    const inv = await getEpicentrBillingInvoice(String(o.epicentr_order_id)).catch(() => null);
    if (!inv) continue;
    const theirs = Number(String(inv.orderCommissionTotal ?? '').replace(',', '.')) || 0;
    const d = Math.round(((ours.get(o.id) ?? 0) - theirs) * 100) / 100;
    if (Math.abs(d) >= MONEY_EPS) { diffs.push(`№${o.order_number}: Епіцентр ${fmtUah(theirs)}, ми ${fmtUah(ours.get(o.id) ?? 0)}`); sum += d; }
  }
  return [{
    key: 'epicentr:commission', area: 'Епіцентр, комісія (60 дн)', level: diffs.length ? 'yellow' : 'green', delta: Math.round(sum * 100) / 100,
    title: diffs.length ? `${diffs.length} замовлень розходяться (${fmtUah(sum)})` : `зійшлось по ${orders.length} замовленнях`,
    detail: 'знак: + ми провели більше, ніж у рахунку білінгу', items: diffs.slice(0, 8),
  }];
}

async function bankFindings(db: Db, prev: Map<string, number>, now: Date): Promise<ReconFinding[]> {
  const out: ReconFinding[] = [];
  const [mono, np, bankLedger, npLedger] = await Promise.all([
    getMonoLiveBalance().catch(() => null), getNovapayLiveBalance().catch(() => null),
    ledgerSum(db, 'bank'), ledgerSum(db, 'novapay'),
  ]);
  const age = (iso: string) => Math.round((now.getTime() - Date.parse(iso)) / 3_600_000);
  if (mono) {
    out.push(balanceFinding({ key: 'bank:mono', area: 'Банк Mono (рахунок ФОП)', ours: bankLedger, theirs: mono.total,
      theirsLabel: `живий залишок (${age(mono.fetchedAt)} год тому)`, previousDelta: prev.get('bank:mono') ?? null,
      note: 'Різниця = операції, ще не розібрані на екрані «Банк», або проведені поза Mono' }));
  } else {
    out.push({ key: 'bank:mono', area: 'Банк Mono', level: 'info', title: 'живий залишок недоступний', detail: 'Mono API не відповів', items: [] });
  }
  if (np) {
    out.push(balanceFinding({ key: 'bank:novapay', area: 'НоваПей', ours: npLedger, theirs: np.available,
      theirsLabel: `доступно в НоваПей (${age(np.fetchedAt)} год тому)`, previousDelta: prev.get('bank:novapay') ?? null,
      note: 'Різниця = нерозібрані рядки на екрані «НоваПей» або виплати в дорозі' }));
  } else {
    out.push({ key: 'bank:novapay', area: 'НоваПей', level: 'info', title: 'живий залишок недоступний', detail: 'кеш НоваПей порожній', items: [] });
  }
  return out;
}

async function payoutFindings(db: Db, now: Date): Promise<ReconFinding[]> {
  const out: ReconFinding[] = [];
  for (const cp of SPECIAL_PAYOUTS) {
    const entries = await fetchAllRows<{ order_id: string | null; amount: number; business_date: string }>((f, t) =>
      db.from('money_entries').select('order_id, amount, business_date')
        .eq('account_type', 'customer').eq('counterparty_id', cp.id).order('id').range(f, t));
    if (!entries.length) continue;
    const open = openItemsByOrder(entries).filter(i => i.orderId);
    const ids = open.map(i => i.orderId!) ;
    const nums = new Map<string, number>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await db.from('orders').select('id, order_number').in('id', ids.slice(i, i + 200)).limit(200);
      for (const o of data ?? []) nums.set(o.id, o.order_number);
    }
    out.push(payoutFinding(cp.id, cp.label, open.map(i => ({ orderNumber: nums.get(i.orderId!) ?? null, net: i.net, lastDate: i.lastDate })), now));
  }
  return out;
}

export type ReconRun = { html: string; findings: ReconFinding[]; sent: boolean; runId: string | null; errors: string[] };

export async function runMarketplaceRecon(opts: { send: boolean; createdBy?: string | null; /** без запису в журнал — для перевірки скриптом */ dryRun?: boolean }): Promise<ReconRun> {
  const started = Date.now();
  const now = new Date();
  const db = createServiceClient();
  const prev = await previousDeltas(db);
  const errors: string[] = [];
  const safe = async (area: string, fn: () => Promise<ReconFinding[]>): Promise<ReconFinding[]> => {
    try { return await fn(); }
    catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${area}: ${msg}`);
      return [{ key: `error:${area}`, area, level: 'yellow', title: 'перевірка не відпрацювала', detail: msg.slice(0, 200), items: [] }];
    }
  };
  // Послідовно: база на nano має обмежений бюджет IO (інцидент 21.09.2026)
  const findings: ReconFinding[] = [
    ...await safe('Rozetka', () => rozetkaFindings(prev, now)),
    ...await safe('Епіцентр', () => epicentrFindings(db, now)),
    ...await safe('Банк і НоваПей', () => bankFindings(db, prev, now)),
    ...await safe('Виплати площадок', () => payoutFindings(db, now)),
    { key: 'prom:manual', area: 'Prom', level: 'info', title: 'API балансу немає — звіряти вставкою виписки', detail: 'Маркетплейси → Prom → «Виписка»', items: [] },
  ];
  const periodLabel = now.toLocaleDateString('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', year: 'numeric' });
  const html = renderReconHtml(findings, { periodLabel, adminUrl: `${SITE_URL}/admin` });

  let sent = false;
  if (opts.send) {
    const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
    const r = chatId ? await sendTelegramResult(chatId, html) : { messageId: null, error: 'TELEGRAM_ADMIN_CHAT_ID не заданий' };
    sent = r.messageId != null;
    if (!sent) alertAdmin('Звірку з маркетплейсами не надіслано в Telegram', r.error ?? 'без причини');
  }
  const runId = opts.dryRun ? null : await logAgentRun({
    agent: RECON_AGENT, input: { send: opts.send }, output: { findings, sent },
    model: 'none', costUsd: 0, inputTokens: 0, outputTokens: 0, toolCalls: 0,
    durationMs: Date.now() - started, error: errors.length ? errors.join(' | ') : null, createdBy: opts.createdBy ?? 'cron',
  });
  return { html, findings, sent, runId, errors };
}
