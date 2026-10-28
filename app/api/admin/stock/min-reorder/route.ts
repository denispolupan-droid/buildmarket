import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '../../../../../lib/auth-guard';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function PATCH(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

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
