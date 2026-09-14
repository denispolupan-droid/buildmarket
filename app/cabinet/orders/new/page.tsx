import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { getNpCodFeePct } from '../../../../lib/np-cod-fee';
import NewOrderClient from './NewOrderClient';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function NewOrderPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: customer }, codFeePct] = await Promise.all([
    serviceClient
      .from('customers')
      .select('balance, balance_held')
      .eq('auth_user_id', user!.id)
      .single(),
    getNpCodFeePct(serviceClient),
  ]);

  const balance      = Number(customer?.balance      ?? 0);
  const balanceHeld  = Number(customer?.balance_held ?? 0);
  const balanceAvail = balance - balanceHeld;

  return <NewOrderClient balanceAvail={balanceAvail} codFeePct={codFeePct} />;
}
