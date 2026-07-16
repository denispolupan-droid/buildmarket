import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import MarketplaceBalanceClient from './MarketplaceBalanceClient';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export type LedgerRow = {
  id: string;
  business_date: string;
  account_type: string;
  amount: number;
  doc_type: string | null;
  order_id: string | null;
  description: string | null;
  created_by: string | null;
};

async function loadMarketplace(marketplace: 'prom' | 'rozetka') {
  const { data } = await db
    .from('money_entries')
    .select('id, business_date, account_type, amount, doc_type, order_id, description, created_by, created_at')
    .in('account_type', ['marketplace_balance', 'marketplace_fee'])
    .eq('counterparty_id', marketplace)
    .order('business_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500);

  const rows = (data ?? []) as LedgerRow[];
  const balance = rows
    .filter(r => r.account_type === 'marketplace_balance')
    .reduce((s, r) => s + Number(r.amount), 0);

  return { rows, balance: Math.round(balance * 100) / 100 };
}

export default async function MarketplaceBalancePage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') redirect('/');

  const [prom, rozetka] = await Promise.all([
    loadMarketplace('prom'),
    loadMarketplace('rozetka'),
  ]);

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: '1300px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <Link href="/admin/finance" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)', textDecoration: 'none' }}>
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            Баланс маркетплейсів
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Поповнення та автоматичне списання комісії за доставлені замовлення — звіряйте з реальним балансом у кабінеті Prom/Rozetka
          </p>
        </div>
      </div>

      <MarketplaceBalanceClient
        prom={prom}
        rozetka={rozetka}
      />
    </div>
  );
}
