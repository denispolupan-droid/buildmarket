import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';
import { Resend } from 'resend';
import { buildCustomerOrderEmail, buildAdminNotificationHtml } from '../../../../lib/invoice-email';
import { notifyAdminNewOrder } from '../../../../lib/telegram';

const resend = new Resend(process.env.RESEND_API_KEY);

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

    const { data: order } = await serviceClient
      .from('orders')
      .update({ status: 'confirmed' })
      .eq('id', orderId)
      .eq('status', 'pending_payment')
      .select('id, order_number, contact, company, phone, email, items, total_price, delivery_type, delivery_address, delivery_city_name, comment')
      .single();

    if (order) {
      const siteUrl    = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://fixline.com.ua';
      const invoiceUrl = `${siteUrl}/invoice/${order.id}`;
      const FROM       = 'FIXLINE <noreply@fixline.com.ua>';
      const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'denis.polupan@gmail.com';

      // Telegram admin notification
      notifyAdminNewOrder({
        order_number:       order.order_number,
        contact:            order.contact,
        company:            order.company ?? null,
        phone:              order.phone,
        total_price:        order.total_price,
        payment_type:       'card',
        delivery_city_name: order.delivery_city_name ?? null,
      });

      // Admin email
      resend.emails.send({
        from: FROM, to: ADMIN_EMAIL,
        subject: `✅ Оплачено! Замовлення №${order.order_number} — ${order.contact} (${order.phone})`,
        html: buildAdminNotificationHtml({
          orderNumber: order.order_number, company: order.company ?? '',
          contact: order.contact, phone: order.phone, email: order.email,
          items: order.items, totalPrice: order.total_price,
          deliveryType: order.delivery_type, deliveryAddress: order.delivery_address ?? '',
          paymentType: 'card', comment: order.comment,
        }),
      }).catch(() => {});

      // Customer confirmation email
      resend.emails.send({
        from: FROM, to: order.email,
        subject: `✅ Оплату підтверджено! Замовлення №${order.order_number} — FIXLINE`,
        html: buildCustomerOrderEmail({
          orderNumber: order.order_number, orderId: order.id,
          company: order.company ?? '', contact: order.contact,
          totalPrice: order.total_price, paymentType: 'card',
          userId: null, invoiceUrl, siteUrl,
        }),
      }).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true });
}
