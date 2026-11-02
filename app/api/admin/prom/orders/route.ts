import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase-service';

const db = createServiceClient();

async function checkAdmin() {
  return (await requireStaff('admin')).ok;
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
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ orders: data ?? [], total: count ?? 0 });
}
