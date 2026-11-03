import { createSupabaseServer } from '../../../lib/supabase-server';
import { redirect } from 'next/navigation';
import ContractsClient from './ContractsClient';
import { createServiceClient } from '../../../lib/supabase-service';
import type { ComponentProps } from 'react';
import { requireStaffPage } from '../../../lib/auth-guard';

const db = createServiceClient();

export default async function ContractsPage() {
  await requireStaffPage('admin', 'manager');
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

  const [{ data: contracts }, { data: balances }] = await Promise.all([
    db.from('customer_contracts').select('*').order('created_at', { ascending: false }),
    db.from('ar_balances').select('contract_id, balance'),
  ]);

  const balanceMap = new Map((balances ?? []).map(b => [b.contract_id, Number(b.balance)]));

  // Resolve customer_number for each contract
  const customerIds = [...new Set((contracts ?? []).map(c => c.customer_id as string))].filter(Boolean);
  let customerNumMap = new Map<string, number | null>();
  if (customerIds.length > 0) {
    const { data: customers } = await db
      .from('customers')
      .select('id, customer_number')
      .in('id', customerIds);
    customerNumMap = new Map((customers ?? []).map(c => [c.id as string, c.customer_number as number | null]));
  }

  const enriched = (contracts ?? []).map(c => ({
    ...c,
    balance:         balanceMap.get(c.id) ?? 0,
    customer_number: customerNumMap.get(c.customer_id) ?? null,
  }));

  return <ContractsClient initialContracts={(enriched) as ComponentProps<typeof ContractsClient>['initialContracts']} />;
}
