import { createSupabaseServer } from '../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import FinanceTabs from '../FinanceTabs';
import BankStatementClient from './BankStatementClient';
import MonoTxnsClient, { type MonoRow } from './MonoTxnsClient';
import { getMonoLiveBalance } from '../../../../lib/mono-balance';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function BankPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

  const [{ data: contracts }, { data: monoRows }, { data: suppliers }, { data: bankRows }, monoLive] = await Promise.all([
    db.from('customer_contracts').select('id, contract_number, customer_id, customer_name').eq('status', 'active').order('customer_name'),
    db.from('mono_bank_txns')
      .select('id, txn_time, amount, direction, comment, description, counter_name, status, category, note, matched_order_id')
      .order('txn_time', { ascending: false }).limit(400),
    db.from('suppliers').select('id, name').order('id'),
    db.from('money_entries').select('amount').eq('account_type', 'bank').limit(20000),
    getMonoLiveBalance(),
  ]);
  const ledgerBank = Math.round((bankRows ?? []).reduce((s, r) => s + Number(r.amount), 0) * 100) / 100;

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: '1100px' }}>
      {/* Header */}
      <div style={{ marginBottom: '14px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          Банківська виписка
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
          Завантажте CSV з Monobank Business — система автоматично зіставить платежі до договорів
        </p>
      </div>

      <FinanceTabs />

      <div style={{ height: '20px' }} />

      {/* Виписка Mono з API: списання і незіставлені надходження — категоризація (з 09.2026) */}
      <MonoTxnsClient
        rows={(monoRows ?? []) as MonoRow[]}
        suppliers={(suppliers ?? []).map(s => ({ id: String(s.id), name: s.name as string }))}
        ledgerBank={ledgerBank}
        liveBank={monoLive ? monoLive.total : null}
      />

      <div style={{ height: '28px' }} />
      <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 10px' }}>Імпорт CSV-виписки (договори)</h2>
      <BankStatementClient contracts={contracts ?? []} />
    </div>
  );
}
