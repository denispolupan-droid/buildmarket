import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { redirect } from 'next/navigation';
import FinanceTabs from '../FinanceTabs';
import MarketplaceBalanceClient from './MarketplaceBalanceClient';
import { loadInTransitCommission } from '../../../../lib/accounting/marketplace-transit';
import { getRzPayCreds } from '../../../../lib/rozetkapay-api';
import RozetkaPayKeysCard from './RozetkaPayKeysCard';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// Логіка комісій «в дорозі» — у lib/accounting/marketplace-transit (спільна з «Оглядом»)
export type { InTransitItem, InTransit } from '../../../../lib/accounting/marketplace-transit';

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
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

  const [prom, rozetka, rzCreds] = await Promise.all([
    Promise.all([loadMarketplace('prom'), loadInTransitCommission('prom')]).then(([m, t]) => ({ ...m, inTransit: t })),
    Promise.all([loadMarketplace('rozetka'), loadInTransitCommission('rozetka')]).then(([m, t]) => ({ ...m, inTransit: t })),
    getRzPayCreds(),
  ]);
  const rzLogin = rzCreds ? (rzCreds.login.length > 4 ? `••••••${rzCreds.login.slice(-4)}` : '••••') : null;

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: '1300px' }}>
      <div style={{ marginBottom: '14px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          Баланс маркетплейсів
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
          Поповнення та автоматичне списання комісії за доставлені замовлення — звіряйте з реальним балансом у кабінеті Prom/Rozetka
        </p>
      </div>

      <FinanceTabs />

      <div style={{ marginTop: '20px' }}>
        <MarketplaceBalanceClient
          prom={prom}
          rozetka={rozetka}
        />
      </div>
      <div style={{ marginTop: '24px' }}>
        <RozetkaPayKeysCard hasKeys={!!rzCreds} login={rzLogin} />
      </div>
    </div>
  );
}
