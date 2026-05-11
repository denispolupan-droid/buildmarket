import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Monobank надсилає підтвердження тільки для статусу "success"
  if (body.status !== 'success') {
    return NextResponse.json({ ok: true });
  }

  const { reference, amount, ccy } = body;
  if (ccy !== 980) return NextResponse.json({ ok: true }); // тільки UAH

  // reference: topup_{customer_id}_{timestamp}
  const match = reference?.match(/^topup_([a-f0-9-]+)_\d+$/);
  if (!match) return NextResponse.json({ ok: true });

  const customerId  = match[1];
  const amountUah   = amount / 100; // копійки → гривні

  const { data: customer } = await serviceClient
    .from('customers')
    .select('id, name')
    .eq('id', customerId)
    .single();

  if (!customer) return NextResponse.json({ ok: true });

  // Видаляємо pending-транзакцію і записуємо реальну через тригер
  await serviceClient
    .from('partner_balance_transactions')
    .delete()
    .eq('customer_id', customerId)
    .eq('created_by', 'monobank_pending');

  await serviceClient.from('partner_balance_transactions').insert({
    customer_id: customerId,
    tx_type:     'top_up',
    amount:      amountUah,
    description: `Поповнення через Monobank — ${amountUah.toFixed(2)} ₴`,
    created_by:  'monobank_webhook',
  });

  return NextResponse.json({ ok: true });
}
