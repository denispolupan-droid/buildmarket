import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { redirect, notFound } from 'next/navigation';
import ActClient, { type ActRow } from '../../_act/ActClient';

export const dynamic = 'force-dynamic';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function SupplierActPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

  const { id } = await params;
  const sp = await searchParams;
  const supplierId = parseInt(id);
  if (isNaN(supplierId)) notFound();

  const today      = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const dateFrom   = sp.from ?? monthStart;
  const dateTo     = sp.to   ?? today;

  const [supplierRes, settingsRes] = await Promise.all([
    db.from('suppliers').select('id, name, legal_name, edrpou').eq('id', supplierId).single(),
    db.from('app_settings').select('key, value').in('key', ['orders_from_name']),
  ]);

  if (!supplierRes.data) notFound();
  const supplier    = supplierRes.data;
  const companyName = settingsRes.data?.find(s => s.key === 'orders_from_name')?.value ?? 'FIXLINE';

  const [openingRes, entriesRes] = await Promise.all([
    db.from('money_entries').select('amount')
      .eq('account_type', 'supplier')
      .eq('counterparty_id', String(supplierId))
      .lt('business_date', dateFrom),
    db.from('money_entries')
      .select('doc_type, amount, business_date, description, doc_id, created_at')
      .eq('account_type', 'supplier')
      .eq('counterparty_id', String(supplierId))
      .gte('business_date', dateFrom)
      .lte('business_date', dateTo)
      .order('business_date', { ascending: true })
      .order('created_at',    { ascending: true }),
  ]);

  const opening = (openingRes.data ?? []).reduce((s, r) => s + Number(r.amount), 0);
  const entries = entriesRes.data ?? [];

  // Fetch doc numbers
  const docIds = [...new Set(entries.map(e => e.doc_id).filter(Boolean))] as string[];
  const { data: docs } = docIds.length
    ? await db.from('acc_documents').select('id, doc_number, doc_type').in('id', docIds)
    : { data: [] };
  const docMap = new Map((docs ?? []).map(d => [d.id as string, { number: d.doc_number as string | null, type: d.doc_type as string }]));

  const rows: ActRow[] = entries.map(e => {
    const amt     = Number(e.amount);
    const docInfo = e.doc_id ? docMap.get(e.doc_id as string) : null;
    let docHref: string | null = null;
    if (e.doc_id && docInfo) {
      if (docInfo.type === 'receipt' || docInfo.type === 'stock_in') {
        docHref = `/admin/procurement/receipts/${e.doc_id}`;
      } else if (docInfo.type === 'purchase_order') {
        docHref = `/admin/procurement/${e.doc_id}`;
      }
    }
    return {
      date:        e.business_date as string,
      description: (e.description as string) ?? '',
      debit:       amt < 0 ? Math.abs(amt) : 0,
      credit:      amt > 0 ? amt : 0,
      docHref,
      docLabel: docInfo?.number ?? null,
    };
  });

  return (
    <ActClient
      backHref="/admin/finance/payables"
      counterpartyName={supplier.name as string}
      counterpartyLegalName={supplier.legal_name as string | null}
      counterpartyTaxId={supplier.edrpou as string | null}
      dateFrom={dateFrom}
      dateTo={dateTo}
      opening={opening}
      rows={rows}
      companyName={companyName}
      mode="supplier"
    />
  );
}
