import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const sku          = searchParams.get('sku');
  const warehouse_id = searchParams.get('warehouse_id');

  if (!sku || !warehouse_id) {
    return NextResponse.json({ error: 'sku and warehouse_id required' }, { status: 400 });
  }

  const include_empty = searchParams.get('include_empty') === 'true';

  const baseQuery = db
    .from('stock_batches')
    .select(`
      id,
      initial_qty,
      remaining_qty,
      cost_price,
      received_at,
      document_id,
      doc:document_id (
        doc_number,
        doc_type,
        doc_date
      )
    `)
    .eq('sku', sku)
    .eq('warehouse_id', Number(warehouse_id))
    .order('received_at', { ascending: true });

  const { data: batches, error } = include_empty
    ? await baseQuery
    : await baseQuery.gt('remaining_qty', 0);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ batches: batches ?? [] });
}
