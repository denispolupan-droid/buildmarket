import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../../lib/supabase-service';
import { withApi } from '../../../../../../lib/api-handler';

const db = createServiceClient();

async function _GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const { data, error } = await db
    .from('partner_balance_transactions')
    .select('id, tx_type, amount, balance_after, description, created_at, order_id')
    .eq('customer_id', id)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export const GET = withApi('admin/partners/[id]/transactions', _GET);
