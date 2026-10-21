import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { redirect, notFound } from 'next/navigation';
import ActClient, { type ActRow } from '../../_act/ActClient';
import { fetchAllRows } from '../../../../../lib/db-paginate';
import { SELLER } from '../../../../../lib/company';

export const dynamic = 'force-dynamic';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * Колонка «Документ» — як у акті постачальника з 1С («Принято (21.10.2026)»),
 * але з нашим номером документа і замовленням, щоб рядок знаходився з обох боків.
 * Знак — з боку постачальника в леджері: мінус — наш борг (поставка), плюс — оплата/повернення.
 */
function docName(docType: string | null, amount: number): string {
  switch (docType) {
    case 'sale':             return amount < 0 ? 'Отримано' : 'Коригування поставки';
    case 'receipt':
    case 'stock_in':         return amount < 0 ? 'Прихід товару' : 'Коригування приходу';
    case 'supplier_payment': return amount > 0 ? 'Оплата' : 'Повернення оплати';
    case 'dropship_cancel':  return amount > 0 ? 'Повернення постачальнику' : 'Коригування (недостача)';
    case 'return_out':       return 'Повернення постачальнику';
    case 'debt_adjustment':  return 'Коригування боргу';
    default:                 return amount < 0 ? 'Нараховано' : 'Списано';
  }
}

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

  const { data: supplier } = await db.from('suppliers').select('id, name, legal_name, edrpou').eq('id', supplierId).single();
  if (!supplier) notFound();

  // Усі проводки з пагінацією й ORDER BY id: у ЗРХ їх уже сотні, а PostgREST
  // мовчки обрізає на 1000 — і сальдо на початок тихо «пливе».
  const [openingRows, entries] = await Promise.all([
    fetchAllRows<{ amount: number }>((f, t) => db.from('money_entries').select('amount')
      .eq('account_type', 'supplier')
      .eq('counterparty_id', String(supplierId))
      .lt('business_date', dateFrom)
      .order('id').range(f, t)),
    fetchAllRows<{ id: string; doc_type: string | null; amount: number; business_date: string; description: string | null; doc_id: string | null; order_id: string | null; created_at: string }>((f, t) => db.from('money_entries')
      .select('id, doc_type, amount, business_date, description, doc_id, order_id, created_at')
      .eq('account_type', 'supplier')
      .eq('counterparty_id', String(supplierId))
      .gte('business_date', dateFrom)
      .lte('business_date', dateTo)
      .order('id').range(f, t)),
  ]);
  entries.sort((a, b) => a.business_date.localeCompare(b.business_date) || a.created_at.localeCompare(b.created_at));

  // Леджер постачальника: мінус — винні ми. В акті «плюс — на нашу користь» — той самий знак.
  const opening = openingRows.reduce((s, r) => s + Number(r.amount), 0);

  const docIds = [...new Set(entries.map(e => e.doc_id).filter(Boolean))] as string[];
  const { data: docs } = docIds.length
    ? await db.from('acc_documents').select('id, doc_number, doc_type').in('id', docIds)
    : { data: [] };
  const docMap = new Map((docs ?? []).map(d => [d.id as string, { number: d.doc_number as string | null, type: d.doc_type as string }]));

  // Номер замовлення — з бази, а не з тексту проводки: у боргів дропшипу,
  // створених з 21.07, опис номера не містить, хоча order_id у проводці є.
  const ordIds = [...new Set(entries.map(e => e.order_id).filter(Boolean))] as string[];
  const { data: ords } = ordIds.length
    ? await db.from('orders').select('id, order_number').in('id', ordIds)
    : { data: [] };
  const ordNumMap = new Map((ords ?? []).map(o => [o.id as string, o.order_number as number]));

  const rows: ActRow[] = entries.map(e => {
    const amt     = Number(e.amount);
    const docInfo = e.doc_id ? docMap.get(e.doc_id) : null;
    let docHref: string | null = null;
    if (e.doc_id && docInfo) {
      if (docInfo.type === 'receipt' || docInfo.type === 'stock_in') docHref = `/admin/procurement/receipts/${e.doc_id}`;
      else if (docInfo.type === 'purchase_order') docHref = `/admin/procurement/${e.doc_id}`;
    }
    const orderNumber = e.order_id ? (ordNumMap.get(e.order_id) ?? null) : null;
    const refs = [docInfo?.number, orderNumber != null ? `#${orderNumber}` : null].filter(Boolean).join(', ');
    return {
      date:        e.business_date,
      docText:     `${docName(e.doc_type, amt)}${refs ? ` (${refs})` : ''}`,
      description: e.description ?? '',
      // Звірка з постачальником: оплати й повернення — дебет, поставки — кредит
      debit:       amt > 0 ? amt : 0,
      credit:      amt < 0 ? Math.abs(amt) : 0,
      docHref,
      orderNumber,
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
      ourName={SELLER.name}
      ourSigner={SELLER.signatory || SELLER.name.replace(/^ФОП\s+/, '')}
      mode="supplier"
    />
  );
}
