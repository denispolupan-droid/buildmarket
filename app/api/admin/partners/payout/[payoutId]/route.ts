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

  if (action === 'reject') {
    const { error } = await db
      .from('partner_payout_requests')
      .update({ status: 'rejected', processed_at: new Date().toISOString(), processed_by: user.email })
      .eq('id', payoutId)
      .eq('status', 'pending');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // approve — атомарно через SQL-функцію (списання балансу + зміна статусу в одній транзакції)
  const { data, error } = await db.rpc('approve_payout', {
    p_payout_id:   payoutId,
    p_admin_email: user.email ?? 'admin',
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = data as { success: boolean; error?: string };
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
