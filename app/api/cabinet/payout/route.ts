import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireCustomer } from '../../../../lib/auth-guard';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  const auth = await requireCustomer('dropship');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null) as { amount?: unknown; method?: unknown; bank_details?: unknown } | null;
  const amount = Number(body?.amount);
  if (!Number.isFinite(amount) || amount < 500) {
    return NextResponse.json({ error: 'Мінімальна сума — 500 ₴' }, { status: 400 });
  }
  const method = body?.method === 'goods_offset' ? 'goods_offset' : 'bank';
  const bankDetails = typeof body?.bank_details === 'string' ? body.bank_details.trim().slice(0, 500) : '';
  if (method === 'bank' && !bankDetails) {
    return NextResponse.json({ error: 'Вкажіть реквізити для переказу' }, { status: 400 });
  }

  const { data, error } = await serviceClient.rpc('submit_payout_request', {
    p_auth_user_id: auth.user.id,
    p_amount:       Math.round(amount * 100) / 100,
    p_method:       method,
    p_bank_details: bankDetails || null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = data as { success: boolean; error?: string };
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
