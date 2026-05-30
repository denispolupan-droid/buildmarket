import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../../lib/supabase';

const db = createServiceClient();

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const role = user?.user_metadata?.role ?? '';
  if (!user || !['admin', 'manager'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const { data: pos } = await db
    .from('acc_documents')
    .select('id, doc_number, doc_date, expected_date, created_at, procurement_status, total_cost, supplier:supplier_id(name)')
    .eq('order_id', id)
    .eq('doc_type', 'purchase_order')
    .neq('status', 'cancelled')
    .order('created_at');

  // Приходи товару для цих PO
  const poIds = (pos ?? []).map(p => p.id);
  const { data: receipts } = poIds.length
    ? await db
        .from('acc_documents')
        .select('id, doc_number, doc_date, created_at, total_cost, parent_doc_id')
        .in('parent_doc_id', poIds)
        .eq('status', 'confirmed')
        .in('doc_type', ['receipt', 'stock_in'])
        .order('created_at')
    : { data: [] };

  // Лінії підтверджених приходів — для відображення скільки кожного SKU отримано
  const receiptIds = (receipts ?? []).map(r => r.id);
  const { data: receiptLines } = receiptIds.length
    ? await db
        .from('acc_document_lines')
        .select('document_id, sku, qty_actual, qty')
        .in('document_id', receiptIds)
    : { data: [] };

  return NextResponse.json({ pos: pos ?? [], receipts: receipts ?? [], receiptLines: receiptLines ?? [] });
}
