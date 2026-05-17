import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { getRole } from '../../../../lib/user-role';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || getRole(user) !== 'dropship') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { amount, method, bank_details } = await req.json();

  if (!amount || typeof amount !== 'number') {
    return NextResponse.json({ error: 'Некоректна сума' }, { status: 400 });
  }

  const { data, error } = await serviceClient.rpc('submit_payout_request', {
    p_auth_user_id: user.id,
    p_amount:       amount,
    p_method:       method ?? 'bank',
    p_bank_details: bank_details ?? null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = data as { success: boolean; error?: string };
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
