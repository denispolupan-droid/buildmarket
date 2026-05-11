import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Верифікація підпису Monobank
// https://api.monobank.ua/docs/acquiring.html#/paths/api-merchant-webhook/post
function verifySignature(body: string, signature: string | null): boolean {
  if (!signature) return false;
  const token = process.env.MONOBANK_API_TOKEN!;
  const hmac  = crypto.createHmac('sha256', token).update(body).digest('base64');
  return hmac === signature;
}

export async function POST(req: NextRequest) {
  const rawBody  = await req.text();
  const signature = req.headers.get('x-sign');

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const body = JSON.parse(rawBody);

  if (body.status !== 'success') {
    return NextResponse.json({ ok: true });
  }

  const { reference, amount, ccy } = body;
  if (ccy !== 980) return NextResponse.json({ ok: true }); // тільки UAH

  // reference: topup_{customer_id}_{timestamp}
  const match = reference?.match(/^topup_([a-f0-9-]+)_\d+$/);
  if (!match) return NextResponse.json({ ok: true });

  const customerId = match[1];
  const amountUah  = amount / 100; // копійки → гривні

  const { data: customer } = await serviceClient
    .from('customers')
    .select('id, name')
    .eq('id', customerId)
    .single();

  if (!customer) return NextResponse.json({ ok: true });

  // Видаляємо pending-запис і зараховуємо реальну суму через тригер
  await serviceClient
    .from('partner_balance_transactions')
    .delete()
    .eq('customer_id', customerId)
    .eq('created_by', 'monobank_pending');

  await serviceClient.from('partner_balance_transactions').insert({
    customer_id: customerId,
    tx_type:     'top_up',
    amount:      amountUah,
    description: `Поповнення карткою онлайн — ${amountUah.toFixed(2)} ₴`,
    created_by:  'monobank_webhook',
  });

  return NextResponse.json({ ok: true });
}
