import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function checkAdmin() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return !!(user && user.user_metadata?.role === 'admin');
}

export async function GET(req: NextRequest) {
  if (!await checkAdmin()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limit  = Number(req.nextUrl.searchParams.get('limit') ?? '50');
  const offset = Number(req.nextUrl.searchParams.get('offset') ?? '0');

  const { data, count, error } = await db
    .from('orders')
    .select('id, order_number, created_at, status, contact, phone, total_price, prom_order_id, items', { count: 'exact' })
    .eq('channel_code', 'prom')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ orders: data ?? [], total: count ?? 0 });
}
