import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '../../../../../../lib/auth-guard';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ payoutId: string }> }) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const { payoutId } = await params;
  const { action } = await req.json().catch(() => ({}));

  if (!['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  // Обидві дії — атомарно через SQL-функції: схвалення списує баланс і знімає
  // резерв заявки, відхилення знімає резерв (міграція 117).
  const { data, error } = await db.rpc(action === 'approve' ? 'approve_payout' : 'reject_payout', {
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
