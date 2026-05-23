import { createSupabaseServer } from '../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import BankStatementClient from './BankStatementClient';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function BankPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') redirect('/');

  const { data: contracts } = await db
    .from('customer_contracts')
    .select('id, contract_number, customer_id, customer_name')
    .eq('status', 'active')
    .order('customer_name');

  return <BankStatementClient contracts={contracts ?? []} />;
}
