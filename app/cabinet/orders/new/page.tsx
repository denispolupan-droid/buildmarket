import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import NewOrderClient from './NewOrderClient';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function NewOrderPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: customer } = await serviceClient
    .from('customers')
    .select('id, name, balance, balance_held')
    .eq('auth_user_id', user!.id)
    .single();

  const balance      = Number(customer?.balance      ?? 0);
  const balanceHeld  = Number(customer?.balance_held ?? 0);
  const balanceAvail = balance - balanceHeld;

  return (
    <NewOrderClient
      customerId={customer?.id ?? ''}
      balanceAvail={balanceAvail}
    />
  );
}
