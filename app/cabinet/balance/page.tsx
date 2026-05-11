import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../lib/supabase-server';
import { Wallet, ArrowDownCircle, Package } from 'lucide-react';
import BalanceClient from './BalanceClient';
import TopUpSection from './TopUpSection';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function BalancePage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: customer } = await serviceClient
    .from('customers')
    .select('id, name, balance, balance_held')
    .eq('auth_user_id', user!.id)
    .single();

  const { data: transactions } = customer ? await serviceClient
    .from('partner_balance_transactions')
    .select('id, tx_type, amount, balance_after, description, created_at, order_id')
    .eq('customer_id', customer.id)
    .order('created_at', { ascending: false })
    .limit(50) : { data: [] };

  const { data: payoutRequests } = customer ? await serviceClient
    .from('partner_payout_requests')
    .select('id, amount, method, status, requested_at, notes')
    .eq('customer_id', customer.id)
    .order('requested_at', { ascending: false })
    .limit(10) : { data: [] };

  const balance      = Number(customer?.balance      ?? 0);
  const balanceHeld  = Number(customer?.balance_held ?? 0);
  const balanceAvail = balance - balanceHeld;

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: '900px' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Баланс</h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Поповнення, транзакції та виведення коштів
        </p>
      </div>

      {/* Balance cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '28px' }}>
        {[
          { label: 'Доступний баланс', value: `${balanceAvail.toFixed(2)} ₴`, color: balanceAvail >= 0 ? '#15803D' : '#DC2626', bg: '#F0FDF4', icon: Wallet },
          { label: 'Зарезервовано',    value: `${balanceHeld.toFixed(2)} ₴`,  color: '#B45309', bg: '#FEF3C7', icon: ArrowDownCircle },
          { label: 'Загальний баланс', value: `${balance.toFixed(2)} ₴`,      color: '#4880B8', bg: '#EFF6FF', icon: Package },
        ].map(c => {
          const Icon = c.icon;
          return (
            <div key={c.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>{c.label}</div>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: c.color }}>{c.value}</div>
                </div>
                <div style={{ width: '38px', height: '38px', borderRadius: '9px', background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={17} color={c.color} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <TopUpSection partnerName={customer?.name ?? 'Партнер'} />

      {/* Interactive part: payout requests */}
      <BalanceClient
        customerId={customer?.id ?? ''}
        transactions={transactions ?? []}
        payoutRequests={payoutRequests ?? []}
      />
    </div>
  );
}
