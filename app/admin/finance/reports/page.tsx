import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { fetchAllRows } from '../../../../lib/db-paginate';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft, BarChart2 } from 'lucide-react';
import ReportsClient, { type PLData, type CFData } from './ReportsClient';

export const dynamic = 'force-dynamic';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

  const { from, to } = await searchParams;
  const now        = new Date();
  const dateFrom   = from ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const dateTo     = to   ?? now.toISOString().slice(0, 10);

  // ══ P&L DATA ════════════════════════════════════════════════════════════════

  // 1. Підтверджені продажі за період.
  //    reversal_of IS NULL — виключаємо документи-сторно: вони скасовують оригінал
  //    (який стає 'cancelled' і вже виключений статусом), а їх власний total_amount у
  //    шапці зберігається додатнім → без фільтра сторно рахувалося б як фантомна виручка.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped supabase client
  const sales = await fetchAllRows<any>((f, t) => db
    .from('acc_documents')
    .select('total_amount, total_cost, channel_code')
    .eq('doc_type', 'sale')
    .eq('status', 'confirmed')
    .is('reversal_of', null)
    .gte('doc_date', dateFrom)
    .lte('doc_date', dateTo)
    .range(f, t));

  // Підсумки P&L — З ЛЕДЖЕРА, а не з шапок РН: (а) сторно повернень автоматично
  // зменшують виручку/COGS (recordReturn пише від'ємні записи на ті самі рахунки);
  // (б) COGS для власного складу — фактичний FIFO з проводок, а шапка РН зберігає
  // лише знімок закупівельної ціни на момент створення чернетки.
  const plLedgerRows = await fetchAllRows<{ account_type: string; amount: number }>((f, t) => db
    .from('money_entries')
    .select('account_type, amount')
    .in('account_type', ['revenue', 'cogs'])
    .gte('business_date', dateFrom)
    .lte('business_date', dateTo)
    .range(f, t));
  let revenue = 0, cogs = 0;
  for (const e of plLedgerRows ?? []) {
    if (e.account_type === 'revenue') revenue -= Number(e.amount);  // кредитовий рахунок → інвертуємо знак
    else cogs += Number(e.amount);
  }

  // По каналах — з шапок документів (у проводках каналу немає): продажі мінус повернення.
  const returns = await fetchAllRows<{ total_amount: number; total_cost: number; channel_code: string | null }>((f, t) => db
    .from('acc_documents')
    .select('total_amount, total_cost, channel_code')
    .eq('doc_type', 'return_in')
    .eq('status', 'confirmed')
    .is('reversal_of', null)
    .gte('doc_date', dateFrom)
    .lte('doc_date', dateTo)
    .range(f, t));
  const channelMap: Record<string, { revenue: number; cogs: number }> = {};
  for (const d of (sales ?? [])) {
    const ch = d.channel_code ?? 'website';
    if (!channelMap[ch]) channelMap[ch] = { revenue: 0, cogs: 0 };
    channelMap[ch].revenue += Number(d.total_amount ?? 0);
    channelMap[ch].cogs    += Number(d.total_cost   ?? 0);
  }
  for (const d of (returns ?? [])) {
    const ch = d.channel_code ?? 'website';
    if (!channelMap[ch]) channelMap[ch] = { revenue: 0, cogs: 0 };
    channelMap[ch].revenue -= Number(d.total_amount ?? 0);
    channelMap[ch].cogs    -= Number(d.total_cost   ?? 0);
  }
  // 2. Landed costs за приходами в цьому ж периоді
  //    Пагінація: landed_cost_lines накопичується безмежно.
  const lcLines = await fetchAllRows((f, t) => db
    .from('landed_cost_lines')
    .select('amount, document_id')
    .eq('distributed', true)
    .range(f, t));

  // Фільтруємо по датах через документи
  const lcDocIds = [...new Set((lcLines ?? []).map(l => l.document_id).filter(Boolean))];
  const { data: lcDocs } = lcDocIds.length
    ? await db.from('acc_documents').select('id, doc_date').in('id', lcDocIds)
        .gte('doc_date', dateFrom).lte('doc_date', dateTo)
    : { data: [] };
  const lcDocSet = new Set((lcDocs ?? []).map(d => d.id));
  const landed_costs = (lcLines ?? [])
    .filter(l => lcDocSet.has(l.document_id))
    .reduce((s, l) => s + Number(l.amount), 0);

  // 3. Операційні витрати (expenses table)
  const { data: expenses } = await db
    .from('expenses')
    .select('amount, expense_type')
    .gte('business_date', dateFrom)
    .lte('business_date', dateTo);

  // 4. Витрати з каси (ручні РКО)
  const { data: cashExpenses } = await db
    .from('money_entries')
    .select('amount')
    .eq('account_type', 'correction')
    .eq('doc_type', 'cash_out')
    .gte('business_date', dateFrom)
    .lte('business_date', dateTo);

  // 5. Комісія маркетплейсів (Prom/Rozetka) — окремий витратний рахунок у леджері,
  //    НЕ в таблиці expenses. Нетто за період (повернення комісій = від'ємні записи).
  const commEntries = await fetchAllRows<{ amount: number; counterparty_id: string | null }>((f, t) => db
    .from('money_entries')
    .select('amount, counterparty_id')
    .eq('account_type', 'marketplace_fee')
    .gte('business_date', dateFrom)
    .lte('business_date', dateTo)
    .range(f, t));
  const marketplace_commission = (commEntries ?? []).reduce((s, e) => s + Number(e.amount), 0);

  // 5б. Доставка НП за наш рахунок (PayerType=Sender) — logistics із doc_type='delivery_cost';
  //     landed-cost закупівель на цьому ж рахунку має інші doc_type і сюди не потрапляє.
  const npDeliveryRows = await fetchAllRows<{ amount: number }>((f, t) => db
    .from('money_entries')
    .select('amount')
    .eq('account_type', 'logistics')
    .eq('doc_type', 'delivery_cost')
    .gte('business_date', dateFrom)
    .lte('business_date', dateTo)
    .range(f, t));
  const np_delivery = (npDeliveryRows ?? []).reduce((s, e) => s + Number(e.amount), 0);
  // Комісія по маркетплейсу (counterparty = 'prom'/'rozetka') — для маржі по каналах.
  const commByChannel: Record<string, number> = {};
  for (const e of (commEntries ?? [])) {
    const mp = e.counterparty_id ?? '';
    if (mp) commByChannel[mp] = (commByChannel[mp] ?? 0) + Number(e.amount);
  }

  const by_channel = Object.entries(channelMap)
    .map(([channel, v]) => ({ channel, ...v, commission: commByChannel[channel] ?? 0 }))
    .sort((a, b) => b.revenue - a.revenue);

  const expensesTotal   = (expenses ?? []).reduce((s, e) => s + Number(e.amount), 0);
  const cashExpTotal    = (cashExpenses ?? []).reduce((s, e) => s + Math.abs(Number(e.amount)), 0);
  const op_expenses     = expensesTotal + cashExpTotal;

  // By expense type
  const expTypeMap: Record<string, number> = {};
  for (const e of (expenses ?? [])) {
    expTypeMap[e.expense_type] = (expTypeMap[e.expense_type] ?? 0) + Number(e.amount);
  }
  if (cashExpTotal > 0) expTypeMap['other'] = (expTypeMap['other'] ?? 0) + cashExpTotal;
  if (marketplace_commission !== 0) expTypeMap['marketplace_fee'] = (expTypeMap['marketplace_fee'] ?? 0) + marketplace_commission;
  if (np_delivery !== 0) expTypeMap['np_delivery'] = (expTypeMap['np_delivery'] ?? 0) + np_delivery;
  const by_expense = Object.entries(expTypeMap)
    .map(([type, amount]) => ({ type, amount }))
    .sort((a, b) => b.amount - a.amount);

  const gross_profit   = revenue - cogs;
  const gross_after_lc = gross_profit - landed_costs;
  // Комісія маркетплейсів і доставка НП за наш рахунок — операційні витрати угод.
  const op_profit      = gross_after_lc - op_expenses - marketplace_commission - np_delivery;

  const pl: PLData = {
    revenue, cogs, gross_profit, landed_costs, gross_after_lc,
    op_expenses, marketplace_commission, np_delivery, op_profit,
    by_channel, by_expense,
  };

  // ══ CASH FLOW DATA ══════════════════════════════════════════════════════════

  // Усі грошові рахунки: каса, банк, еквайринг, НоваПей (COD від «Контроль оплати»).
  const CASH_ACCOUNTS = ['cash', 'bank', 'acquiring', 'novapay'];

  // Відкриваючий залишок (все до dateFrom). Пагінація критична.
  const prevCash = await fetchAllRows<{ amount: number }>((f, t) => db
    .from('money_entries')
    .select('amount')
    .in('account_type', CASH_ACCOUNTS)
    .lt('business_date', dateFrom)
    .range(f, t));
  const opening = prevCash.reduce((s, e) => s + Number(e.amount), 0);

  // Всі рухи за період
  const cfEntries = await fetchAllRows<{ account_type: string; amount: number; doc_type: string | null }>((f, t) => db
    .from('money_entries')
    .select('account_type, amount, doc_type')
    .in('account_type', CASH_ACCOUNTS)
    .gte('business_date', dateFrom)
    .lte('business_date', dateTo)
    .range(f, t));

  // Детальні статті — за doc_type / рахунком.
  const inflowKey = (acc: string, dt: string | null): string => {
    if (acc === 'novapay') return 'cod';                        // накладені платежі, зібрані НоваПей
    if (dt === 'payment' || dt === 'customer_payment') return 'customers';
    if (dt === 'cash_in') return 'cash_in';
    return 'other_in';
  };
  const outflowKey = (dt: string | null): string => {
    if (dt === 'supplier_payment') return 'suppliers';
    if (dt === 'marketplace_topup') return 'mp_topup';          // поповнення балансу маркетплейсів
    if (dt === 'novapay_payout')    return 'np_payout';         // виплата НоваПей → банк (Фаза 2)
    if (dt === 'cash_out')          return 'expenses';
    return 'other_out';
  };

  const accountMap: Record<string, { in: number; out: number }> = {};
  const inflowMap:  Record<string, number> = {};
  const outflowMap: Record<string, number> = {};
  for (const e of cfEntries ?? []) {
    const amt = Number(e.amount);
    const acc = e.account_type;
    if (!accountMap[acc]) accountMap[acc] = { in: 0, out: 0 };
    if (amt > 0) accountMap[acc].in += amt;
    else         accountMap[acc].out += Math.abs(amt);
    // Внутрішній переказ між рахунками — у «По рахунках» видно, але у статтях руху НЕ показуємо
    // (інакше та сама сума висіла б і в приходах, і у видатках).
    if (e.doc_type === 'transfer') continue;
    if (amt > 0) {
      const k = inflowKey(acc, e.doc_type);
      inflowMap[k] = (inflowMap[k] ?? 0) + amt;
    } else {
      const k = outflowKey(e.doc_type);
      outflowMap[k] = (outflowMap[k] ?? 0) + Math.abs(amt);
    }
  }
  // Показуємо всі платіжні рахунки, навіть з нульовим рухом.
  for (const a of CASH_ACCOUNTS) if (!accountMap[a]) accountMap[a] = { in: 0, out: 0 };

  const netCF   = (cfEntries ?? []).reduce((s, e) => s + Number(e.amount), 0);
  const closing = opening + netCF;

  // Монобанк = bank + acquiring (один рахунок у банку — переказ/картка на сайті). Далі НоваПей, Каса.
  const mono = { in: accountMap['bank'].in + accountMap['acquiring'].in, out: accountMap['bank'].out + accountMap['acquiring'].out };
  const by_account = [
    { account: 'monobank', ...mono },
    { account: 'novapay',  ...accountMap['novapay'] },
    { account: 'cash',     ...accountMap['cash'] },
  ];
  const inflows  = Object.entries(inflowMap).map(([key, amount]) => ({ key, amount })).sort((a, b) => b.amount - a.amount);
  const outflows = Object.entries(outflowMap).map(([key, amount]) => ({ key, amount })).sort((a, b) => b.amount - a.amount);

  // Поточні залишки рахунків (усього, без фільтра періоду) — «Стан рахунків».
  const allBal = await fetchAllRows<{ account_type: string; amount: number }>((f, t) => db
    .from('money_entries')
    .select('account_type, amount')
    .in('account_type', ['bank', 'acquiring', 'novapay', 'cash'])
    .range(f, t));
  const balances = { monobank: 0, novapay: 0, cash: 0 };
  for (const r of allBal) {
    const v = Number(r.amount);
    if (r.account_type === 'bank' || r.account_type === 'acquiring') balances.monobank += v;
    else if (r.account_type === 'novapay') balances.novapay += v;
    else if (r.account_type === 'cash') balances.cash += v;
  }

  const cf: CFData = { opening, closing, inflows, outflows, by_account, balances };

  const periodLabel = `${new Date(dateFrom).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })} — ${new Date(dateTo).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: '1300px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <Link href="/admin/finance" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)', textDecoration: 'none' }}>
          <ArrowLeft size={16} />
        </Link>
        <BarChart2 size={18} color="#1E3A5F" />
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          Звіти
        </h1>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{periodLabel}</span>
      </div>

      <Suspense>
        <ReportsClient pl={pl} cf={cf} dateFrom={dateFrom} dateTo={dateTo} />
      </Suspense>
    </div>
  );
}
