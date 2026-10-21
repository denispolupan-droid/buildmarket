import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { redirect, notFound } from 'next/navigation';
import ActClient, { type ActRow } from '../../_act/ActClient';
import { isSpecialDebtor, SPECIAL_DEBTOR_LABEL } from '../../../../../lib/accounting/sale-party';
import { fetchAllRows } from '../../../../../lib/db-paginate';
import { SELLER } from '../../../../../lib/company';

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
  debt_adjustment:  'Коригування боргу',
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
  const customerRes = special
    ? { data: { id: customerId, name: SPECIAL_DEBTOR_LABEL[customerId], company: null, legal_name: null, tax_number: null, city: null, address: null } }
    : await db.from('customers').select('id, name, company, legal_name, tax_number, city, address').eq('id', customerId).single();

  if (!customerRes.data) notFound();
  const customer    = customerRes.data;

  const displayName = (customer.company as string | null)?.trim()
    || (customer.legal_name as string | null)?.trim()
    || (customer.name as string);

  const address = [customer.city, customer.address].filter(Boolean).join(', ') || null;

  // З пагінацією й ORDER BY id: PostgREST мовчки обрізає на 1000 рядків
  const [openingRows, txns] = await Promise.all([
    fetchAllRows<{ amount: number }>((f, t) => db.from('money_entries').select('amount')
      .eq('account_type', 'customer')
      .eq('counterparty_id', customerId)
      .lt('business_date', dateFrom)
      .order('id').range(f, t)),
    fetchAllRows<{ id: string; business_date: string; created_at: string; amount: number; doc_type: string | null; doc_id: string | null; order_id: string | null; description: string | null }>((f, t) => db.from('ar_transactions')
      .select('id, business_date, created_at, amount, doc_type, doc_id, order_id, description')
      .eq('customer_id', customerId)
      .gte('business_date', dateFrom)
      .lte('business_date', dateTo)
      .order('id').range(f, t)),
  ]);
  txns.sort((a, b) => a.business_date.localeCompare(b.business_date) || String(a.created_at).localeCompare(String(b.created_at)));

  const opening = openingRows.reduce((s, r) => s + Number(r.amount), 0);

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
      ? (t.doc_type === 'debt_adjustment' ? `/admin/finance/adjustments?id=${t.doc_id}` : `/admin/accounting/documents/${t.doc_id}`)
      : (t.order_id ? `/admin/orders/${t.order_id}` : null);
    return {
      date: t.business_date as string,
      docText: orderNum ? `${typeLabel} (#${orderNum})` : typeLabel,
      description,
      debit:  amt > 0 ? amt : 0,
      credit: amt < 0 ? Math.abs(amt) : 0,
      docHref,
      orderNumber: orderNum ?? null,
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
      ourName={SELLER.name}
      ourSigner={SELLER.signatory || SELLER.name.replace(/^ФОП\s+/, '')}
      mode="customer"
    />
  );
}
