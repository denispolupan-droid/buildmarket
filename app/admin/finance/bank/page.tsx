import { createSupabaseServer } from '../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import FinanceTabs from '../FinanceTabs';
import BankStatementClient from './BankStatementClient';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function BankPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

  const { data: contracts } = await db
    .from('customer_contracts')
    .select('id, contract_number, customer_id, customer_name')
    .eq('status', 'active')
    .order('customer_name');

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

      <BankStatementClient contracts={contracts ?? []} />
    </div>
  );
}
