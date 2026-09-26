/**
 * «Коригування боргу» — документ КБ (acc_documents.doc_type = 'debt_adjustment').
 *
 * Правила (проводки, межі, вплив на замовлення) — у чистому модулі
 * debt-adjustment-rules.ts; тут — база: стан сторін, проведення, скасування,
 * читання для екрана.
 *
 * Три шари, які документ тримає узгодженими:
 *   1. леджер money_entries — проводка на рядок (record_money_txn_legs: різні
 *      order_id на дебеті й кредиті), ключ debt-adj:<doc>:<рядок>;
 *   2. шар замовлення — order_payments (mode 'adjustment', знак = напрямок) і
 *      amount_paid/payment_confirmed = Σ нескасованих рядків, як у reverse-payment;
 *   3. сам документ — одразу 'confirmed' (як платіжні ваучери), скасування =
 *      зворотні проводки + зворотні рядки оплат, документ → 'cancelled'.
 *
 * Дропшип-замовлення (channel_code = 'dropship') сюди не пускаємо: їхній борг
 * живе в балансі партнера (partner_balance_transactions), і перенесення повз
 * нього розійшло б кабінет з обліком.
 *
 * Сторона «партнер» (фаза 2, міграція 121): нога 'partner' у проводці + рядок
 * partner_balance_transactions (tx_type 'adjustment', external_ref = ключ
 * проводки) — тригер fn_update_partner_balance править customers.balance, і
 * кабінет партнера бачить зміну одразу. Скасування — зворотний рядок.
 */
import { createServiceClient } from '../supabase';
import { fetchAllRows } from '../db-paginate';
import { isSpecialDebtor, SPECIAL_DEBTOR_LABEL } from './sale-party';
import { settlementFor, type SettlementEntry } from './order-settlement';
import {
  legsFor, sidesOf, validateLine, orderPaymentDeltas, partnerBalanceDeltas, describeLine, totalAmount, sideKey, sideStateFrom,
  isDebtAccount, ACCOUNT_LABEL,
  type AdjustmentLineInput, type DebtSide, type DebtAccount, type SideState, type LegAccount,
} from './debt-adjustment-rules';

type Db = ReturnType<typeof createServiceClient>;

const round2 = (n: number) => Math.round(n * 100) / 100;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Стан сторін ─────────────────────────────────────────────────────────────

async function partyBalance(db: Db, account: DebtAccount, party: string): Promise<number> {
  const { data } = await db
    .from('counterparty_balances')
    .select('balance')
    .eq('counterparty_id', party)
    .eq('account_type', account)
    .eq('currency', 'UAH')
    .maybeSingle();
  return round2(Number(data?.balance ?? 0));
}

/** Кабінетний баланс дропшипера (customers.balance) — межа для списання з партнера. */
async function partnerCabinetBalance(db: Db, partner: string): Promise<number> {
  if (!UUID_RE.test(partner)) return 0;
  const { data } = await db.from('customers').select('balance, type').eq('id', partner).maybeSingle();
  if (!data || data.type !== 'dropship_partner') return 0;
  return round2(Number(data.balance ?? 0));
}

async function orderEntries(db: Db, account: DebtAccount, party: string, orderId: string): Promise<SettlementEntry[]> {
  const { data } = await db
    .from('money_entries')
    .select('order_id, counterparty_id, amount, doc_type')
    .eq('account_type', account)
    .eq('counterparty_id', party)
    .eq('order_id', orderId)
    .limit(1000);
  return (data ?? []) as SettlementEntry[];
}

export async function sideState(db: Db, side: DebtSide): Promise<SideState> {
  const balance = await partyBalance(db, side.account, side.party);
  const entries = side.orderId ? await orderEntries(db, side.account, side.party, side.orderId) : null;
  const cabinet = side.account === 'partner' ? await partnerCabinetBalance(db, side.party) : undefined;
  return sideStateFrom(balance, entries, cabinet);
}

export type OpenItem = {
  order_id: string; order_number: number | null; created_at: string | null; status: string | null;
  channel_code: string | null; contact: string | null;
  sale: number; received: number; open: number;
};

/**
 * Замовлення сторони з розкладом «продаж / отримано / відкрито» — для вибору
 * у формі. Береться з леджера (рахунок сторони по order_id), тож сюди потрапляють
 * і замовлення без картки клієнта, якщо їх колись перенесли на цього контрагента.
 */
export async function openItems(db: Db, side: Pick<DebtSide, 'account' | 'party'>): Promise<OpenItem[]> {
  const rows = await fetchAllRows<{ order_id: string | null; counterparty_id: string | null; amount: number; doc_type: string | null }>((f, t) => db
    .from('money_entries')
    .select('order_id, counterparty_id, amount, doc_type')
    .eq('account_type', side.account)
    .eq('counterparty_id', side.party)
    .not('order_id', 'is', null)
    .order('created_at', { ascending: true })
    .range(f, t));
  const byOrder = new Map<string, SettlementEntry[]>();
  for (const r of rows) (byOrder.get(r.order_id!) ?? byOrder.set(r.order_id!, []).get(r.order_id!)!).push(r);

  const ids = [...byOrder.keys()];
  const orders = ids.length
    ? await fetchAllRows<{ id: string; order_number: number; created_at: string; status: string; channel_code: string | null; contact: string | null }>((f, t) => db
        .from('orders').select('id, order_number, created_at, status, channel_code, contact').in('id', ids).range(f, t))
    : [];
  const meta = new Map(orders.map(o => [o.id, o]));

  const out: OpenItem[] = [];
  for (const [orderId, entries] of byOrder) {
    const s = settlementFor(entries);
    if (s.sale <= 0.005 && s.received <= 0.005) continue;
    const o = meta.get(orderId);
    out.push({
      order_id: orderId, order_number: o?.order_number ?? null, created_at: o?.created_at ?? null, status: o?.status ?? null,
      channel_code: o?.channel_code ?? null, contact: o?.contact ?? null, sale: s.sale, received: s.received, open: s.open,
    });
  }
  return out.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
}

// ── Назви сторін ─────────────────────────────────────────────────────────────

async function sideLabels(db: Db, sides: DebtSide[]): Promise<(s: DebtSide) => string> {
  const customerIds = [...new Set(sides.filter(s => (s.account === 'customer' || s.account === 'partner') && !isSpecialDebtor(s.party) && UUID_RE.test(s.party)).map(s => s.party))];
  const supplierIds = [...new Set(sides.filter(s => s.account === 'supplier').map(s => Number(s.party)).filter(Number.isInteger))];
  const orderIds    = [...new Set(sides.map(s => s.orderId).filter((x): x is string => !!x))];
  const [cust, sup, ord] = await Promise.all([
    customerIds.length ? db.from('customers').select('id, name, company, legal_name').in('id', customerIds) : Promise.resolve({ data: [] as { id: string; name: string; company: string | null; legal_name: string | null }[] }),
    supplierIds.length ? db.from('suppliers').select('id, name').in('id', supplierIds) : Promise.resolve({ data: [] as { id: number; name: string }[] }),
    orderIds.length    ? db.from('orders').select('id, order_number').in('id', orderIds) : Promise.resolve({ data: [] as { id: string; order_number: number }[] }),
  ]);
  const cMap = new Map((cust.data ?? []).map(c => [c.id, (c.company?.trim() || c.legal_name?.trim() || c.name) as string]));
  const sMap = new Map((sup.data ?? []).map(s => [String(s.id), s.name]));
  const oMap = new Map((ord.data ?? []).map(o => [o.id, o.order_number]));
  return (s: DebtSide) => {
    const who = s.account === 'supplier'
      ? `постачальник ${sMap.get(s.party) ?? s.party}`
      : s.account === 'partner'
        ? `партнер ${cMap.get(s.party) ?? s.party}`
        : isSpecialDebtor(s.party) ? SPECIAL_DEBTOR_LABEL[s.party] : (cMap.get(s.party) ?? s.party);
    const ord = s.orderId ? ` (замовлення #${oMap.get(s.orderId) ?? s.orderId.slice(0, 8)})` : '';
    return `${who}${ord}`;
  };
}

// ── Проведення ───────────────────────────────────────────────────────────────

export type CreateDebtAdjustmentInput = {
  lines: AdjustmentLineInput[];
  businessDate?: string;      // YYYY-MM-DD, за замовчуванням сьогодні
  notes?: string | null;
  createdBy: string;
  meta?: Record<string, unknown>;
};

export type DebtAdjustmentResult = { id: string; doc_number: string; total: number };

async function recordLegs(db: Db, p: {
  debit: { account: LegAccount; party: string | null; orderId: string | null };
  credit: { account: LegAccount; party: string | null; orderId: string | null };
  amount: number; businessDate: string; docId: string; description: string; idempotencyKey: string; createdBy: string; meta?: Record<string, unknown>;
}): Promise<string> {
  const { data, error } = await db.rpc('record_money_txn_legs', {
    p_debit_account: p.debit.account, p_debit_party: p.debit.party, p_debit_order_id: p.debit.orderId, p_debit_contract_id: null,
    p_credit_account: p.credit.account, p_credit_party: p.credit.party, p_credit_order_id: p.credit.orderId, p_credit_contract_id: null,
    p_amount: p.amount, p_business_date: p.businessDate, p_doc_id: p.docId, p_doc_type: 'debt_adjustment',
    p_description: p.description, p_idempotency_key: p.idempotencyKey, p_created_by: p.createdBy, p_meta: p.meta ?? {},
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/** amount_paid / payment_confirmed = Σ нескасованих рядків order_payments (як у reverse-payment). */
async function resyncOrderPaid(db: Db, orderId: string): Promise<void> {
  const [{ data: rows }, { data: order }] = await Promise.all([
    db.from('order_payments').select('amount').eq('order_id', orderId).eq('reversed', false).limit(1000),
    db.from('orders').select('total_price').eq('id', orderId).maybeSingle(),
  ]);
  const paid = round2((rows ?? []).reduce((s, r) => s + Number(r.amount), 0));
  const total = Number(order?.total_price ?? 0);
  await db.from('orders').update({
    amount_paid: Math.max(0, paid),
    payment_confirmed: total > 0 && paid >= total * 0.999,
  }).eq('id', orderId);
}

async function applyOrderDeltas(db: Db, deltas: { orderId: string; delta: number }[], p: { docId: string; docNumber: string; businessDate: string; createdBy: string; note: string }): Promise<void> {
  for (const d of deltas) {
    if (Math.abs(d.delta) < 0.005) continue;
    const { error } = await db.from('order_payments').insert({
      order_id: d.orderId, amount: d.delta, payment_mode: 'adjustment', payment_date: p.businessDate,
      note: `${p.docNumber}: ${p.note}`, created_by: p.createdBy, doc_id: p.docId,
    });
    if (error) throw new Error(`order_payments: ${error.message}`);
    await resyncOrderPaid(db, d.orderId);
  }
}

/**
 * Шар кабінету партнера: рядок partner_balance_transactions на кожну ногу
 * 'partner'. external_ref унікальний (ключ проводки + партнер), тож повтор —
 * дублікат, який ми мовчки пропускаємо.
 */
async function applyPartnerDeltas(db: Db, deltas: { partner: string; delta: number }[], p: { keyBase: string; docNumber: string; createdBy: string; note: string }): Promise<void> {
  for (const d of deltas) {
    if (Math.abs(d.delta) < 0.005) continue;
    const { error } = await db.from('partner_balance_transactions').insert({
      customer_id: d.partner, tx_type: 'adjustment', amount: d.delta,
      description: `${p.docNumber}: ${p.note}`, created_by: p.createdBy, external_ref: `${p.keyBase}:${d.partner}`,
    });
    if (error && !/unique|duplicate|23505/.test(error.message)) throw new Error(`partner_balance_transactions: ${error.message}`);
  }
}

export async function createDebtAdjustment(input: CreateDebtAdjustmentInput): Promise<DebtAdjustmentResult> {
  const db = createServiceClient();
  if (!input.lines.length) throw new Error('Документ без рядків');
  if (input.lines.length > 50) throw new Error('Забагато рядків (до 50)');
  const bizDate = input.businessDate && /^\d{4}-\d{2}-\d{2}$/.test(input.businessDate) ? input.businessDate : new Date().toISOString().slice(0, 10);

  // Стан кожної сторони — один раз; кілька рядків на ту саму сторону перевіряються
  // послідовно з урахуванням попередніх рядків (аванс не можна витратити двічі).
  const allSides = input.lines.flatMap(sidesOf);
  const states = new Map<string, SideState>();
  for (const s of allSides) {
    const k = sideKey(s);
    if (!states.has(k)) states.set(k, await sideState(db, s));
  }
  const label = await sideLabels(db, allSides);

  // Дропшип-замовлення живуть у балансі партнера — не тут.
  const orderIds = [...new Set(allSides.map(s => s.orderId).filter((x): x is string => !!x))];
  if (orderIds.length) {
    const { data: ords } = await db.from('orders').select('id, order_number, channel_code').in('id', orderIds);
    const found = new Set((ords ?? []).map(o => o.id));
    for (const id of orderIds) if (!found.has(id)) throw new Error(`Замовлення ${id} не знайдено`);
    const drop = (ords ?? []).find(o => o.channel_code === 'dropship');
    if (drop) throw new Error(`Замовлення #${drop.order_number} — дропшип: його борг живе в балансі партнера, коригуйте баланс тут стороною «Партнер»`);
  }

  // Партнер — лише картка дропшипера
  const partnerIds = [...new Set(allSides.filter(s => s.account === 'partner').map(s => s.party))];
  if (partnerIds.length) {
    const { data: ps } = await db.from('customers').select('id, type').in('id', partnerIds.filter(p => UUID_RE.test(p)));
    const ok = new Set((ps ?? []).filter(p => p.type === 'dropship_partner').map(p => p.id));
    for (const id of partnerIds) if (!ok.has(id)) throw new Error(`${label({ account: 'partner', party: id })} — не дропшип-партнер`);
  }

  for (const [i, line] of input.lines.entries()) {
    const err = validateLine(line, { stateOf: s => states.get(sideKey(s)), label });
    if (err) throw new Error(`Рядок ${i + 1}: ${err}`);
    // Спожити межі для наступних рядків
    const { debit, credit } = legsFor(line);
    const amt = round2(Number(line.amount));
    if (isDebtAccount(debit.account)) {
      const st = states.get(sideKey(debit as DebtSide))!;
      st.balance = round2(st.balance + amt);
      if (debit.orderId) { st.received = round2((st.received ?? 0) - amt); st.open = round2((st.open ?? 0) + amt); }
      if (debit.account === 'partner') st.cabinet = round2((st.cabinet ?? 0) - amt);
    }
    if (isDebtAccount(credit.account)) {
      const st = states.get(sideKey(credit as DebtSide))!;
      st.balance = round2(st.balance - amt);
      if (credit.orderId) { st.received = round2((st.received ?? 0) + amt); st.open = round2((st.open ?? 0) - amt); }
      if (credit.account === 'partner') st.cabinet = round2((st.cabinet ?? 0) + amt);
    }
  }

  // Документ — одразу проведений, як платіжні ваучери
  const { data: docNumber, error: numErr } = await db.rpc('next_doc_number', { p_type: 'debt_adjustment' });
  if (numErr) throw new Error(numErr.message);
  const firstCustomer = allSides.find(s => (s.account === 'customer' || s.account === 'partner') && UUID_RE.test(s.party) && !isSpecialDebtor(s.party))?.party ?? null;
  const firstSupplier = allSides.find(s => s.account === 'supplier')?.party ?? null;
  const now = new Date().toISOString();
  const { data: doc, error: docErr } = await db.from('acc_documents').insert({
    doc_type: 'debt_adjustment', doc_number: docNumber as string, status: 'confirmed',
    customer_id: firstCustomer, supplier_id: firstSupplier ? Number(firstSupplier) : null,
    total_amount: totalAmount(input.lines), total_cost: 0,
    doc_date: new Date(bizDate + 'T00:00:00').toISOString(), notes: input.notes?.trim() || null,
    confirmed_at: now, confirmed_by: input.createdBy, created_by: input.createdBy,
    meta: { ...(input.meta ?? {}), ops: [...new Set(input.lines.map(l => l.op))], lines: input.lines.length },
  }).select('id, doc_number').single();
  if (docErr || !doc) throw new Error(docErr?.message ?? 'Не вдалося створити документ');

  const lineRows = input.lines.map((line, i) => {
    const { debit, credit } = legsFor(line);
    return {
      document_id: doc.id, line_no: i + 1, op: line.op,
      debit_account: debit.account, debit_party: debit.party, debit_order_id: debit.orderId,
      credit_account: credit.account, credit_party: credit.party, credit_order_id: credit.orderId,
      amount: round2(Number(line.amount)), note: line.note?.trim() || null,
    };
  });
  const { error: linesErr } = await db.from('debt_adjustment_lines').insert(lineRows);
  if (linesErr) {
    await db.from('acc_documents').delete().eq('id', doc.id);
    throw new Error(`Рядки: ${linesErr.message}`);
  }

  // Проводки і шар замовлення. Якщо щось упало посередині — документ лишається
  // з частиною проводок; повторне проведення неможливе (ключі), тож скасувати
  // його можна штатно, зворотні проводки підуть лише по проведених рядках.
  for (const [i, line] of input.lines.entries()) {
    const { debit, credit } = legsFor(line);
    const description = `${doc.doc_number}: ${describeLine(line, label)}${line.note?.trim() ? ` — ${line.note.trim()}` : ''}`;
    const txnId = await recordLegs(db, {
      debit, credit, amount: round2(Number(line.amount)), businessDate: bizDate, docId: doc.id, description,
      idempotencyKey: `debt-adj:${doc.id}:${i + 1}`, createdBy: input.createdBy, meta: { op: line.op, line_no: i + 1 },
    });
    await db.from('debt_adjustment_lines').update({ txn_id: txnId }).eq('document_id', doc.id).eq('line_no', i + 1);
    await applyOrderDeltas(db, orderPaymentDeltas(line), { docId: doc.id, docNumber: doc.doc_number, businessDate: bizDate, createdBy: input.createdBy, note: describeLine(line, label) });
    await applyPartnerDeltas(db, partnerBalanceDeltas(line), { keyBase: `debt-adj:${doc.id}:${i + 1}`, docNumber: doc.doc_number, createdBy: input.createdBy, note: describeLine(line, label) });
  }

  return { id: doc.id, doc_number: doc.doc_number, total: totalAmount(input.lines) };
}

// ── Скасування ───────────────────────────────────────────────────────────────

export async function cancelDebtAdjustment(docId: string, cancelledBy: string, reason?: string | null): Promise<void> {
  const db = createServiceClient();
  const { data: doc } = await db.from('acc_documents').select('id, doc_number, doc_type, status').eq('id', docId).maybeSingle();
  if (!doc || doc.doc_type !== 'debt_adjustment') throw new Error('Документ не знайдено');
  if (doc.status === 'cancelled') throw new Error('Документ уже скасовано');

  const { data: lines } = await db.from('debt_adjustment_lines').select('*').eq('document_id', docId).order('line_no');
  const today = new Date().toISOString().slice(0, 10);

  for (const l of lines ?? []) {
    if (!l.txn_id || l.reversal_txn_id) continue;
    // Зворотна проводка — ноги міняються місцями, дата — сьогодні (append-only, як усюди)
    const txnId = await recordLegs(db, {
      debit:  { account: l.credit_account, party: l.credit_party, orderId: l.credit_order_id },
      credit: { account: l.debit_account,  party: l.debit_party,  orderId: l.debit_order_id },
      amount: round2(Number(l.amount)), businessDate: today, docId, description: `Скасування ${doc.doc_number} (рядок ${l.line_no})${reason ? ': ' + reason : ''}`,
      idempotencyKey: `debt-adj-rev:${docId}:${l.line_no}`, createdBy: cancelledBy, meta: { op: l.op, line_no: l.line_no, reversal: true },
    });
    await db.from('debt_adjustment_lines').update({ reversal_txn_id: txnId }).eq('id', l.id);

    // Шар замовлення — рядки з протилежним знаком і перерахунок amount_paid
    const deltas: { orderId: string; delta: number }[] = [];
    const real = (acc: string, party: string | null, orderId: string | null) => acc === 'customer' && !!orderId && !!party && !isSpecialDebtor(party);
    if (real(l.credit_account, l.credit_party, l.credit_order_id)) deltas.push({ orderId: l.credit_order_id, delta: -round2(Number(l.amount)) });
    if (real(l.debit_account,  l.debit_party,  l.debit_order_id))  deltas.push({ orderId: l.debit_order_id,  delta:  round2(Number(l.amount)) });
    await applyOrderDeltas(db, deltas, { docId, docNumber: doc.doc_number, businessDate: today, createdBy: cancelledBy, note: `скасування рядка ${l.line_no}` });

    // Шар кабінету партнера — зворотний рядок
    const pDeltas: { partner: string; delta: number }[] = [];
    if (l.credit_account === 'partner' && l.credit_party) pDeltas.push({ partner: l.credit_party, delta: -round2(Number(l.amount)) });
    if (l.debit_account  === 'partner' && l.debit_party)  pDeltas.push({ partner: l.debit_party,  delta:  round2(Number(l.amount)) });
    await applyPartnerDeltas(db, pDeltas, { keyBase: `debt-adj-rev:${docId}:${l.line_no}`, docNumber: doc.doc_number, createdBy: cancelledBy, note: `скасування рядка ${l.line_no}` });
  }

  const { error } = await db.from('acc_documents').update({
    status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: cancelledBy, cancel_reason: reason?.trim() || null,
  }).eq('id', docId);
  if (error) throw new Error(error.message);
}

// ── Читання для екрана ───────────────────────────────────────────────────────

export type DebtAdjustmentLineView = {
  line_no: number; op: string; amount: number; note: string | null;
  debit:  { account: string; party: string | null; order_id: string | null; label: string };
  credit: { account: string; party: string | null; order_id: string | null; label: string };
  posted: boolean; reversed: boolean;
};
export type DebtAdjustmentView = {
  id: string; doc_number: string; status: string; doc_date: string; total_amount: number;
  notes: string | null; created_by: string | null; cancelled_by: string | null; cancel_reason: string | null;
  lines: DebtAdjustmentLineView[];
};

export async function listDebtAdjustments(db: Db, opts: { limit?: number; id?: string } = {}): Promise<DebtAdjustmentView[]> {
  let q = db.from('acc_documents')
    .select('id, doc_number, status, doc_date, total_amount, notes, created_by, cancelled_by, cancel_reason')
    .eq('doc_type', 'debt_adjustment')
    .order('doc_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.id) q = q.eq('id', opts.id);
  const { data: docs, error } = await q;
  if (error) throw new Error(error.message);
  if (!docs?.length) return [];

  const { data: lines } = await db.from('debt_adjustment_lines').select('*').in('document_id', docs.map(d => d.id)).order('line_no').limit(5000);
  const sides: DebtSide[] = [];
  for (const l of lines ?? []) {
    if (isDebtAccount(l.debit_account))  sides.push({ account: l.debit_account,  party: l.debit_party,  orderId: l.debit_order_id });
    if (isDebtAccount(l.credit_account)) sides.push({ account: l.credit_account, party: l.credit_party, orderId: l.credit_order_id });
  }
  const label = await sideLabels(db, sides);
  const legLabel = (acc: string, party: string | null, orderId: string | null) =>
    isDebtAccount(acc) ? label({ account: acc, party: party ?? '', orderId }) : (ACCOUNT_LABEL[acc as LegAccount] ?? acc);

  return docs.map(d => ({
    id: d.id, doc_number: d.doc_number, status: d.status, doc_date: d.doc_date, total_amount: Number(d.total_amount),
    notes: d.notes, created_by: d.created_by, cancelled_by: d.cancelled_by, cancel_reason: d.cancel_reason,
    lines: (lines ?? []).filter(l => l.document_id === d.id).map(l => ({
      line_no: l.line_no, op: l.op, amount: Number(l.amount), note: l.note,
      debit:  { account: l.debit_account,  party: l.debit_party,  order_id: l.debit_order_id,  label: legLabel(l.debit_account,  l.debit_party,  l.debit_order_id) },
      credit: { account: l.credit_account, party: l.credit_party, order_id: l.credit_order_id, label: legLabel(l.credit_account, l.credit_party, l.credit_order_id) },
      posted: !!l.txn_id, reversed: !!l.reversal_txn_id,
    })),
  }));
}
