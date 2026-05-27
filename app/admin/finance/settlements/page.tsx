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
  searchParams: Promise<{ customerId?: string; contractId?: string }>;
}) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') redirect('/');

  const { customerId, contractId } = await searchParams;

  // Усі договори (всі статуси — щоб можна було дивитись і закриті)
  const { data: contracts } = await db
    .from('customer_contracts')
    .select('id, contract_number, customer_id, customer_name, status')
    .order('customer_name');

  // Клієнти, у яких є хоча б один договір
  const customerIds = [...new Set((contracts ?? []).map(c => c.customer_id).filter(Boolean))];
  const customers = customerIds.length > 0
    ? ((await db.from('customers').select('id, name, company, legal_name').in('id', customerIds)).data ?? [])
    : [];

  // Якщо прийшов тільки contractId (старі посилання) — знаходимо customerId
  let resolvedCustomerId = customerId;
  if (!resolvedCustomerId && contractId) {
    const found = (contracts ?? []).find(c => c.id === contractId);
    resolvedCustomerId = found?.customer_id ?? undefined;
  }

  return (
    <SettlementsClient
      customers={customers}
      contracts={contracts ?? []}
      defaultCustomerId={resolvedCustomerId}
      defaultContractId={contractId}
    />
  );
}
