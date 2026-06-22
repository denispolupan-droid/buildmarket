import { createClient } from '@supabase/supabase-js';
import DocumentsClient from './DocumentsClient';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function DocumentsPage() {
  const { data: docs } = await db
    .from('acc_documents')
    .select(`
      id, doc_type, doc_number, status, doc_date, created_at,
      total_amount, total_cost, notes, counterparty, order_id,
      confirmed_at, cancelled_at, reversal_of,
      warehouse:warehouse_id ( name ),
      supplier:supplier_id ( name )
    `)
    .order('created_at', { ascending: false })
    .limit(200);

  const { data: warehouses } = await db
    .from('warehouses')
    .select('id, name, warehouse_type')
    .eq('is_active', true)
    .order('sort_order');

  const { data: suppliers } = await db
    .from('suppliers')
    .select('id, name')
    .eq('is_active', true)
    .order('name');

  const { data: docTypes } = await db
    .from('acc_doc_types')
    .select('code, name, direction')
    .order('sort_order');

  const normalizedDocs = (docs ?? []).map(d => ({
    ...d,
    warehouse: Array.isArray(d.warehouse) ? d.warehouse[0] ?? null : d.warehouse,
    supplier:  Array.isArray(d.supplier)  ? d.supplier[0]  ?? null : d.supplier,
  }));

  return (
    <DocumentsClient
      initialDocs={normalizedDocs as Parameters<typeof DocumentsClient>[0]['initialDocs']}
      warehouses={warehouses ?? []}
      suppliers={suppliers ?? []}
      docTypes={docTypes ?? []}
    />
  );
}
