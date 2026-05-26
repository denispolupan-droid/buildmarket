import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../lib/supabase-server';
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
  if (!user || user.user_metadata?.role !== 'admin') redirect('/');

  const { from, to } = await searchParams;
  const now        = new Date();
  const dateFrom   = from ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const dateTo     = to   ?? now.toISOString().slice(0, 10);

  // ══ P&L DATA ════════════════════════════════════════════════════════════════

  // 1. Підтверджені продажі за період
  const { data: sales } = await db
    .from('acc_documents')
    .select('total_amount, total_cost, channel_code')
    .eq('doc_type', 'sale')
    .eq('status', 'confirmed')
    .gte('doc_date', dateFrom)
    .lte('doc_date', dateTo);

  const revenue   = (sales ?? []).reduce((s, d) => s + Number(d.total_amount ?? 0), 0);
  const cogs      = (sales ?? []).reduce((s, d) => s + Number(d.total_cost   ?? 0), 0);

  // По каналах
  const channelMap: Record<string, { revenue: number; cogs: number }> = {};
  for (const d of (sales ?? [])) {
    const ch = d.channel_code ?? 'website';
    if (!channelMap[ch]) channelMap[ch] = { revenue: 0, cogs: 0 };
    channelMap[ch].revenue += Number(d.total_amount ?? 0);
    channelMap[ch].cogs    += Number(d.total_cost   ?? 0);
  }
  const by_channel = Object.entries(channelMap)
    .map(([channel, v]) => ({ channel, ...v }))
    .sort((a, b) => b.revenue - a.revenue);

  // 2. Landed costs за приходами в цьому ж периоді
  const { data: lcLines } = await db
    .from('landed_cost_lines')
    .select('amount, document_id')
    .eq('distributed', true);

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

  const expensesTotal   = (expenses ?? []).reduce((s, e) => s + Number(e.amount), 0);
  const cashExpTotal    = (cashExpenses ?? []).reduce((s, e) => s + Math.abs(Number(e.amount)), 0);
  const op_expenses     = expensesTotal + cashExpTotal;

  // By expense type
  const expTypeMap: Record<string, number> = {};
  for (const e of (expenses ?? [])) {
    expTypeMap[e.expense_type] = (expTypeMap[e.expense_type] ?? 0) + Number(e.amount);
  }
  if (cashExpTotal > 0) expTypeMap['other'] = (expTypeMap['other'] ?? 0) + cashExpTotal;
  const by_expense = Object.entries(expTypeMap)
    .map(([type, amount]) => ({ type, amount }))
    .sort((a, b) => b.amount - a.amount);

  const gross_profit   = revenue - cogs;
  const gross_after_lc = gross_profit - landed_costs;
  const op_profit      = gross_after_lc - op_expenses;

  const pl: PLData = {
    revenue, cogs, gross_profit, landed_costs, gross_after_lc, op_expenses, op_profit,
    by_channel, by_expense,
  };

  // ══ CASH FLOW DATA ══════════════════════════════════════════════════════════

  // Відкриваючий залишок (всі рахунки каса+банк+еквайринг ДО dateFrom)
  const { data: prevCash } = await db
    .from('money_entries')
    .select('amount')
    .in('account_type', ['cash', 'bank', 'acquiring'])
    .lt('business_date', dateFrom);
  const opening = (prevCash ?? []).reduce((s, e) => s + Number(e.amount), 0);

  // Всі рухи за період
  const { data: cfEntries } = await db
    .from('money_entries')
    .select('account_type, amount, doc_type, counterparty_id')
    .in('account_type', ['cash', 'bank', 'acquiring'])
    .gte('business_date', dateFrom)
    .lte('business_date', dateTo);

  // Рухи по рахунках
  const accountMap: Record<string, { in: number; out: number }> = {};
  let in_customers = 0, in_other = 0, out_suppliers = 0, out_expenses_cf = 0, out_other = 0;

  // Знаходимо supplier-пов'язані txn_id (щоб визначити чи це оплата постачальнику)
  const cfTxnIds = [...new Set((cfEntries ?? []).map((e: Record<string, unknown>) => (e as {txn_id?: string}).txn_id).filter(Boolean))];

  // Партнерні записи для визначення типу контрагента
  const { data: partnerEntries } = cfTxnIds.length
    ? await db.from('money_entries').select('txn_id, account_type')
        .in('txn_id', cfTxnIds)
        .in('account_type', ['customer', 'supplier', 'advance', 'correction'])
    : { data: [] };

  // txn_id → тип (customer payment / supplier payment / expense / other)
  type TxnType = 'customer' | 'supplier' | 'expense' | 'other';
  const txnTypeMap = new Map<string, TxnType>();
  for (const pe of (partnerEntries ?? []) as Array<{ txn_id: string; account_type: string }>) {
    if (pe.account_type === 'customer' || pe.account_type === 'advance') txnTypeMap.set(pe.txn_id, 'customer');
    else if (pe.account_type === 'supplier') txnTypeMap.set(pe.txn_id, 'supplier');
    else if (pe.account_type === 'correction') txnTypeMap.set(pe.txn_id, 'expense');
    else if (!txnTypeMap.has(pe.txn_id)) txnTypeMap.set(pe.txn_id, 'other');
  }

  for (const e of (cfEntries ?? []) as Array<{ account_type: string; amount: number; txn_id?: string }>) {
    const amt = Number(e.amount);
    const acc = e.account_type;
    if (!accountMap[acc]) accountMap[acc] = { in: 0, out: 0 };
    if (amt > 0) accountMap[acc].in  += amt;
    else         accountMap[acc].out += Math.abs(amt);

    const ttype = e.txn_id ? (txnTypeMap.get(e.txn_id) ?? 'other') : 'other';
    if (amt > 0) {
      if (ttype === 'customer') in_customers += amt;
      else                      in_other     += amt;
    } else {
      if (ttype === 'supplier') out_suppliers  += Math.abs(amt);
      else if (ttype === 'expense') out_expenses_cf += Math.abs(amt);
      else                      out_other      += Math.abs(amt);
    }
  }

  const netCF  = (cfEntries ?? []).reduce((s, e) => s + Number((e as {amount: number}).amount), 0);
  const closing = opening + netCF;

  const by_account = Object.entries(accountMap)
    .map(([account, v]) => ({ account, ...v }))
    .sort((a, b) => (b.in + b.out) - (a.in + a.out));

  const cf: CFData = {
    opening, closing,
    in_customers, in_other,
    out_suppliers, out_expenses: out_expenses_cf, out_other,
    by_account,
  };

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
