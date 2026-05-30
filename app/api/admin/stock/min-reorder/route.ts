import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function PATCH(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { sku, warehouse_id, min_reorder_qty } = await req.json() as {
    sku: string; warehouse_id: number; min_reorder_qty: number | null;
  };

  const { error } = await db
    .from('stock_balance')
    .update({ min_reorder_qty: min_reorder_qty ?? null })
    .eq('sku', sku)
    .eq('warehouse_id', warehouse_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
