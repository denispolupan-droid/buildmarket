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

  return NextResponse.json({ pos: pos ?? [] });
}
