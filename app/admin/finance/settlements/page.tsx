import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { fetchAllRows } from '../../../../lib/db-paginate';
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
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

  const { customerId, contractId } = await searchParams;

  // Усі договори (всі статуси — щоб можна було дивитись і закриті)
  const { data: contracts } = await db
    .from('customer_contracts')
    .select('id, contract_number, customer_id, customer_name, status')
    .order('customer_name');

  // Клієнти з money_entries (включно з тими, що без договору — напр. Водяний)
  //    Пагінація: без range() частина клієнтів зникала б зі звірки при > 1000 проводок.
  const meEntries = await fetchAllRows((f, t) => db
    .from('money_entries')
    .select('counterparty_id')
    .eq('account_type', 'customer')
    .not('counterparty_id', 'is', null)
    .range(f, t));

  const contractCustomerIds = new Set((contracts ?? []).map(c => c.customer_id).filter(Boolean));
  const meCustomerIds = [...new Set(meEntries.map(e => e.counterparty_id as string).filter(Boolean))];
  const allCustomerIds = [...new Set([...contractCustomerIds, ...meCustomerIds])];

  const customers = allCustomerIds.length > 0
    ? ((await db.from('customers').select('id, name, company, legal_name').in('id', allCustomerIds)).data ?? [])
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
