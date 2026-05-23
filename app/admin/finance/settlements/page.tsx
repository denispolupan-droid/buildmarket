import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { redirect } from 'next/navigation';
import SettlementsClient from './SettlementsClient';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function SettlementsPage({
  searchParams,
}: {
  searchParams: Promise<{ contractId?: string }>;
}) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') redirect('/');

  const { contractId } = await searchParams;

  const { data: contracts } = await db
    .from('customer_contracts')
    .select('id, contract_number, customer_id, customer_name, status')
    .eq('status', 'active')
    .order('customer_name');

  return <SettlementsClient contracts={contracts ?? []} defaultContractId={contractId} />;
}
