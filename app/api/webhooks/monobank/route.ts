import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';
import { Resend } from 'resend';
import { buildCustomerOrderEmail, buildAdminNotificationHtml } from '../../../../lib/invoice-email';
import { notifyAdminNewOrder } from '../../../../lib/telegram';
import { recordCustomerPayment } from '../../../../lib/accounting/money';

const resend = new Resend(process.env.RESEND_API_KEY);

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Cache the public key for the process lifetime (changes rarely)
let _monoPubKey: string | null = null;
async function getMonoPubKey(): Promise<string | null> {
  if (_monoPubKey) return _monoPubKey;
  try {
    const res = await fetch('https://api.monobank.ua/api/merchant/pubkey', {
      headers: { 'X-Token': process.env.MONOBANK_API_TOKEN! },
    });
    if (!res.ok) return null;
    const data = await res.json();
    _monoPubKey = data.key as string; // base64-encoded DER public key
    return _monoPubKey;
  } catch {
    return null;
  }
}

async function verifySignature(body: string, signature: string | null): Promise<boolean> {
  if (!signature) return false;
  try {
    const pubKeyB64 = await getMonoPubKey();
    if (!pubKeyB64) return false;
    const pubKeyDer = Buffer.from(pubKeyB64, 'base64');
    const pubKey = crypto.createPublicKey({ key: pubKeyDer, format: 'der', type: 'spki' });
    return crypto.verify(
      'SHA256',
      Buffer.from(body),
      { key: pubKey, padding: crypto.constants.RSA_PKCS1_PSS_PADDING },
      Buffer.from(signature, 'base64'),
    );
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const rawBody  = await req.text();
  const signature = req.headers.get('x-sign');

  if (!await verifySignature(rawBody, signature)) {
    console.error('[monobank webhook] invalid signature, x-sign:', signature?.slice(0, 20));
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const body = JSON.parse(rawBody);

  if (body.status !== 'success') {
    return NextResponse.json({ ok: true });
  }

  const { reference, amount, ccy } = body;
  if (ccy !== 980) return NextResponse.json({ ok: true });

  const amountUah = amount / 100;
  const siteUrl    = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://fixline.com.ua';
  const FROM       = 'FIXLINE <noreply@fixline.com.ua>';
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'orders@fixline.com.ua';

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

  // ── Оплата замовлення (нова схема: pending draft → orders) ──────────────
  const pendingMatch = reference?.match(/^pending_([a-f0-9-]+)_\d+$/);
  if (pendingMatch) {
    const pendingId = pendingMatch[1];

    // READ first — do NOT delete yet; deletion happens only after order is safely created
    const { data: draft } = await serviceClient
      .from('pending_card_orders')
      .select('payload, user_id, email')
      .eq('id', pendingId)
      .single();

    if (!draft) {
      // Already processed by a previous webhook retry — idempotent OK
      return NextResponse.json({ ok: true });
    }

    const { data: order, error: orderErr } = await serviceClient
      .from('orders')
      .insert({ ...draft.payload, status: 'confirmed' })
      .select('id, order_number, contact, company, phone, email, items, total_price, delivery_type, delivery_address, delivery_city_name, comment, channel_code')
      .single();

    if (orderErr || !order) {
      // Return 500 so Monobank retries; pending record is still intact
      console.error('[monobank webhook] order insert failed:', orderErr);
      notifyAdminOrderFailed(reference, draft.email, amountUah, orderErr?.message ?? 'unknown');
      return NextResponse.json({ error: 'order insert failed' }, { status: 500 });
    }

    // Order saved — now safe to remove the pending draft
    await serviceClient.from('pending_card_orders').delete().eq('id', pendingId);

    if (draft.payload?.promo_code) {
      serviceClient.rpc('increment_promo_used', { p_code: draft.payload.promo_code }).then(() => {});
    }

    const invoiceUrl = `${siteUrl}/invoice/${order.id}`;

    // Записуємо оплату в AR-леджер
    await recordOrderPaymentToLedger(order.id, draft.user_id, amountUah, businessDate(body));

    notifyAdminNewOrder({
      order_number:       order.order_number,
      contact:            order.contact,
      company:            order.company ?? null,
      phone:              order.phone,
      total_price:        order.total_price,
      payment_type:       'card',
      delivery_city_name: order.delivery_city_name ?? null,
    });

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

    return NextResponse.json({ ok: true });
  }

  // ── Оплата замовлення (стара схема: order_<uuid> — зворотна сумісність) ─
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
      const invoiceUrl = `${siteUrl}/invoice/${order.id}`;

      // Записуємо оплату в AR-леджер
      await recordOrderPaymentToLedger(order.id, null, amountUah, businessDate(body));

      notifyAdminNewOrder({
        order_number:       order.order_number,
        contact:            order.contact,
        company:            order.company ?? null,
        phone:              order.phone,
        total_price:        order.total_price,
        payment_type:       'card',
        delivery_city_name: order.delivery_city_name ?? null,
      });

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function notifyAdminOrderFailed(reference: string, email: string, amount: number, errMsg: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !chatId) return;
  const text = `🚨 *Monobank webhook: не вдалось створити замовлення*\n\nReference: \`${reference}\`\nEmail: ${email}\nСума: ${amount} ₴\nПомилка: ${errMsg}\n\nПеревір pending\\_card\\_orders і створи замовлення вручну.`;
  fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  }).catch(() => {});
}

function businessDate(body: { createdAt?: number }): string {
  const ts = body.createdAt ? body.createdAt * 1000 : Date.now();
  return new Date(ts).toISOString().slice(0, 10);
}

async function recordOrderPaymentToLedger(
  orderId: string,
  userId: string | null,
  amount: number,
  date: string,
) {
  try {
    // Знаходимо замовлення і активний договір клієнта
    const { data: order } = await serviceClient
      .from('orders')
      .select('id, order_number, contact, channel_code')
      .eq('id', orderId)
      .single();

    if (!order) return;

    // Шукаємо customer_id через auth_user_id або по email
    let customerId: string | null = null;
    let contractId: string | null = null;

    if (userId) {
      const { data: customer } = await serviceClient
        .from('customers')
        .select('id')
        .eq('auth_user_id', userId)
        .single();
      customerId = customer?.id ?? null;
    }

    if (customerId) {
      const { data: contract } = await serviceClient
        .from('customer_contracts')
        .select('id')
        .eq('customer_id', customerId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      contractId = contract?.id ?? null;
    }

    await recordCustomerPayment({
      customerId:      customerId ?? `order:${orderId}`,
      contractId:      contractId ?? undefined,
      amount,
      paymentMethod:   'acquiring',
      businessDate:    date,
      description:     `Оплата картою — замовлення #${order.order_number}`,
      createdBy:       'monobank_webhook',
      idempotencyKey:  `mono:payment:${orderId}`,
    });
  } catch (err) {
    console.error('[monobank] recordOrderPaymentToLedger failed:', err);
  }
}
