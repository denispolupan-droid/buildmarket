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
    .select('id, doc_number, doc_date, created_at, procurement_status, total_cost, supplier:supplier_id(name)')
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

  return NextResponse.json({ pos: pos ?? [], receipts: receipts ?? [] });
}
