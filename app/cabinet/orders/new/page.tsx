import { requireCustomerPage } from '../../../../lib/auth-guard';
import { getNpCodFeePct, getMeestCodFeePct } from '../../../../lib/np-cod-fee';
import NewOrderClient from './NewOrderClient';
import { createServiceClient } from '../../../../lib/supabase-service';

const serviceClient = createServiceClient();

export default async function NewOrderPage() {
  const user = await requireCustomerPage('dropship');

  const [{ data: customer }, codFeePct, meestFee] = await Promise.all([
    serviceClient
      .from('customers')
      .select('balance, balance_held')
      .eq('auth_user_id', user.id)
      .single(),
    getNpCodFeePct(serviceClient),
    getMeestCodFeePct(serviceClient),
  ]);

  const balance      = Number(customer?.balance      ?? 0);
  const balanceHeld  = Number(customer?.balance_held ?? 0);
  const balanceAvail = balance - balanceHeld;

  return <NewOrderClient balanceAvail={balanceAvail} codFeePct={codFeePct} meestCodFeePct={meestFee.pct} />;
}
