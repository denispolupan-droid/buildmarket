import { createClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import FinanceTabs from '../FinanceTabs';
import NovapayClient, { type NovapayRow } from './NovapayClient';
import { getNovapayLiveBalance } from '../../../../lib/novapay-api';
import { unsettledNpCod } from '../../../../lib/novapay-ingest';

export const dynamic = 'force-dynamic';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function NovapayPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

  const [{ data: rows }, { data: ledgerRows }, { data: npCod }, live, unsettled] = await Promise.all([
    db.from('novapay_txns')
      .select('id, txn_date, amount, direction, counterparty, purpose, register_no, kind, status, category, note, posted_at')
      .order('txn_date', { ascending: false }).order('id', { ascending: false }).limit(500),
    db.from('money_entries').select('amount').eq('account_type', 'novapay').limit(20000),
    db.from('counterparty_balances').select('balance').eq('account_type', 'customer').eq('counterparty_id', 'np:cod').maybeSingle(),
    getNovapayLiveBalance(),
    unsettledNpCod(),
  ]);

  const ledger = Math.round((ledgerRows ?? []).reduce((s, r) => s + Number(r.amount), 0) * 100) / 100;
  const lastRegister = (rows ?? []).find(r => r.kind === 'cod_payout')?.txn_date ?? null;
  // Залишок за випискою (Σ усіх документів) і те, що живий залишок показує понад нього —
  // виплати, що вже прийшли, але документа ще немає (виписка закриває день уранці)
  const { data: allStmt } = await db.from('novapay_txns').select('direction, amount').limit(10000);
  const stmtBalance = Math.round((allStmt ?? []).reduce((s, r) => s + (r.direction === 'in' ? 1 : -1) * Number(r.amount), 0) * 100) / 100;
  const receivedUnbooked = live ? Math.max(0, Math.round((live.available - stmtBalance) * 100) / 100) : 0;
  const pending = unsettled.sort((a, b) => b.delivered.localeCompare(a.delivered));
  const aggregate = (rows ?? []).filter(r => r.category === 'cod_payout_aggregate');

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: '1300px' }}>
      <div style={{ marginBottom: '14px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Рахунок NovaPay</h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
          Виписка з API NovaPay: виплати наложки за реєстрами НП проводяться самі, списання категоризуєте тут
        </p>
      </div>
      <FinanceTabs />
      <div style={{ marginTop: '20px' }}>
        <NovapayClient
          rows={(rows ?? []) as NovapayRow[]}
          ledger={ledger}
          live={live ? { available: live.available, fetchedAt: live.fetchedAt } : null}
          npCod={Number(npCod?.balance ?? 0)}
          stmtBalance={stmtBalance}
          receivedUnbooked={receivedUnbooked}
          lastRegister={lastRegister}
          pending={pending.map(o => ({ order_number: o.order_number, total: o.gross, delivered: o.delivered }))}
          aggregate={aggregate.map(r => ({ date: String(r.txn_date), net: Number(r.amount), register: (r.register_no as string | null) ?? null }))}
        />
      </div>
    </div>
  );
}
