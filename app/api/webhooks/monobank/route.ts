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
  if (ccy !== 980) return NextResponse.json({ ok: true });

  const amountUah = amount / 100;

  // ── Поповнення балансу партнера ─────────────────────────────────────────
  const topupMatch = reference?.match(/^topup_([a-f0-9-]+)_\d+$/);
  if (topupMatch) {
    const customerId = topupMatch[1];

    const { data: customer } = await serviceClient
      .from('customers').select('id').eq('id', customerId).single();

    if (customer) {
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
    }
    return NextResponse.json({ ok: true });
  }

  // ── Оплата замовлення з кошика ──────────────────────────────────────────
  const orderMatch = reference?.match(/^order_([a-f0-9-]+)_\d+$/);
  if (orderMatch) {
    const orderId = orderMatch[1];

    await serviceClient
      .from('orders')
      .update({ status: 'confirmed', payment_type: 'card' })
      .eq('id', orderId)
      .eq('status', 'pending_payment');
  }

  return NextResponse.json({ ok: true });
}
