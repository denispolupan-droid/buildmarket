import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ payoutId: string }> }) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { payoutId } = await params;
  const { action } = await req.json();

  if (!['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const newStatus = action === 'approve' ? 'approved' : 'rejected';

  // Якщо підтверджуємо — списуємо з балансу
  if (action === 'approve') {
    const { data: payout } = await db
      .from('partner_payout_requests')
      .select('customer_id, amount, method')
      .eq('id', payoutId)
      .single();

    if (payout) {
      await db.from('partner_balance_transactions').insert({
        customer_id: payout.customer_id,
        tx_type:     payout.method === 'goods_offset' ? 'goods_offset' : 'payout',
        amount:      -payout.amount,
        description: `Виплата підтверджена адміном`,
        created_by:  user.email ?? 'admin',
      });
    }
  }

  const { error } = await db
    .from('partner_payout_requests')
    .update({ status: newStatus, processed_at: new Date().toISOString(), processed_by: user.email })
    .eq('id', payoutId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
