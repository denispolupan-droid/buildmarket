import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../../lib/supabase-server';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { customer_id, amount, description } = await req.json();
  if (!customer_id || !amount || amount <= 0) {
    return NextResponse.json({ error: 'Невірні параметри' }, { status: 400 });
  }

  const { error } = await db.from('partner_balance_transactions').insert({
    customer_id,
    tx_type:     'top_up',
    amount:      Number(amount),
    description: description || 'Поповнення балансу (адмін)',
    created_by:  user.email ?? 'admin',
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
