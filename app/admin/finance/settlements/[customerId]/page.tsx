import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { redirect, notFound } from 'next/navigation';
import ActClient, { type ActRow } from '../../_act/ActClient';
import { isSpecialDebtor, SPECIAL_DEBTOR_LABEL } from '../../../../../lib/accounting/sale-party';

export const dynamic = 'force-dynamic';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const DOC_LABELS: Record<string, string> = {
  sale:             'Відвантаження',
  customer_payment: 'Оплата',
  payment:          'Оплата',
  return_out:       'Повернення',
  correction:       'Коригування',
  cogs:             'Собівартість',
};

export default async function CustomerActPage({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

  const { customerId } = await params;
  const sp = await searchParams;

  const today      = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const dateFrom   = sp.from ?? monthStart;
  const dateTo     = sp.to   ?? today;

  // Службові дебітори (np:cod, mp:prom, …) — не рядки customers: акт по них теж
  // потрібен (сверка транзиту з виписками), але без реквізитів.
  const special = isSpecialDebtor(customerId);
  const [customerRes, settingsRes] = await Promise.all([
    special
      ? Promise.resolve({ data: { id: customerId, name: SPECIAL_DEBTOR_LABEL[customerId], company: null, legal_name: null, tax_number: null, city: null, address: null } })
      : db.from('customers').select('id, name, company, legal_name, tax_number, city, address').eq('id', customerId).single(),
    db.from('app_settings').select('key, value').in('key', ['orders_from_name']),
  ]);

  if (!customerRes.data) notFound();
  const customer    = customerRes.data;
  const companyName = settingsRes.data?.find(s => s.key === 'orders_from_name')?.value ?? 'FIXLINE';

  const displayName = (customer.company as string | null)?.trim()
    || (customer.legal_name as string | null)?.trim()
    || (customer.name as string);

  const address = [customer.city, customer.address].filter(Boolean).join(', ') || null;

  const [openingRes, txnRes] = await Promise.all([
    db.from('money_entries').select('amount')
      .eq('account_type', 'customer')
      .eq('counterparty_id', customerId)
      .lt('business_date', dateFrom),
    db.from('ar_transactions')
      .select('id, business_date, customer_id, amount, doc_type, doc_id, order_id, description')
      .eq('customer_id', customerId)
      .gte('business_date', dateFrom)
      .lte('business_date', dateTo)
      .order('business_date', { ascending: true })
      .order('created_at',    { ascending: true }),
  ]);

  const opening = (openingRes.data ?? []).reduce((s, r) => s + Number(r.amount), 0);
  const txns    = txnRes.data ?? [];

  // Fetch order numbers for links
  const orderIds = [...new Set(txns.map(t => t.order_id).filter(Boolean))] as string[];
  const { data: orders } = orderIds.length
    ? await db.from('orders').select('id, order_number').in('id', orderIds)
    : { data: [] };
  const orderMap = new Map((orders ?? []).map(o => [o.id as string, o.order_number as number]));

  const rows: ActRow[] = txns.map(t => {
    const amt = Number(t.amount);
    const orderNum = t.order_id ? orderMap.get(t.order_id as string) : null;
    const typeLabel = DOC_LABELS[t.doc_type ?? ''] ?? t.doc_type ?? '—';
    const description = (t.description as string)
      || (orderNum ? `${typeLabel} — замовлення #${orderNum}` : typeLabel);

    const docHref = t.doc_id
      ? `/admin/accounting/documents/${t.doc_id}`
      : (t.order_id ? `/admin/orders/${t.order_id}` : null);
    const docLabel = orderNum ? `#${orderNum}` : null;

    return {
      date: t.business_date as string,
      description,
      debit:  amt > 0 ? amt : 0,
      credit: amt < 0 ? Math.abs(amt) : 0,
      docHref,
      docLabel,
    };
  });

  return (
    <ActClient
      backHref="/admin/finance/settlements"
      counterpartyName={displayName}
      counterpartyLegalName={customer.legal_name as string | null}
      counterpartyTaxId={customer.tax_number as string | null}
      counterpartyAddress={address}
      dateFrom={dateFrom}
      dateTo={dateTo}
      opening={opening}
      rows={rows}
      companyName={companyName}
      mode="customer"
    />
  );
}
