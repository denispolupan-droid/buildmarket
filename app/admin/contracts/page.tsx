import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../lib/supabase-server';
import { redirect } from 'next/navigation';
import ContractsClient from './ContractsClient';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function ContractsPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') redirect('/');

  const [{ data: contracts }, { data: balances }] = await Promise.all([
    db.from('customer_contracts').select('*').order('created_at', { ascending: false }),
    db.from('ar_balances').select('contract_id, balance'),
  ]);

  const balanceMap = new Map((balances ?? []).map(b => [b.contract_id, Number(b.balance)]));

  const enriched = (contracts ?? []).map(c => ({
    ...c,
    balance: balanceMap.get(c.id) ?? 0,
  }));

  return <ContractsClient initialContracts={enriched} />;
}
