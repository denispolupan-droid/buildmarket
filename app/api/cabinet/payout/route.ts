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

  if (!amount || amount < 500) {
    return NextResponse.json({ error: 'Мінімальна сума — 500 грн' }, { status: 400 });
  }
  if (method === 'bank' && !bank_details) {
    return NextResponse.json({ error: 'Вкажіть реквізити' }, { status: 400 });
  }

  const { data: customer } = await serviceClient
    .from('customers')
    .select('id, balance, balance_held')
    .eq('auth_user_id', user.id)
    .single();

  if (!customer) return NextResponse.json({ error: 'Партнера не знайдено' }, { status: 404 });

  const available = Number(customer.balance) - Number(customer.balance_held);
  if (available < amount) {
    return NextResponse.json({ error: `Недостатньо коштів. Доступно: ${available.toFixed(2)} ₴` }, { status: 400 });
  }

  const { error } = await serviceClient.from('partner_payout_requests').insert({
    customer_id:  customer.id,
    amount,
    method,
    bank_details: bank_details ?? null,
    status:       'pending',
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
