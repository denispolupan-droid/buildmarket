import { NextRequest, NextResponse } from 'next/server';
import * as crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { buildCustomerOrderEmail, buildAdminNotificationHtml } from '../../../../lib/invoice-email';
import { notifyAdminNewOrder } from '../../../../lib/telegram';
import { recordCustomerPayment } from '../../../../lib/accounting/money';
import { verifyMonoSignature } from '../../../../lib/mono-signature';
import { alertAdmin } from '../../../../lib/alert';

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
  const pubKeyB64 = await getMonoPubKey();
  return verifyMonoSignature(body, signature, pubKeyB64);
}

export async function POST(req: NextRequest) {
  const rawBody  = await req.text();
  const signature = req.headers.get('x-sign');

  if (!await verifySignature(rawBody, signature)) {
    // Діагностика саме на невдачі: ззовні «підпис не зійшовся» виглядає однаково
    // для зовсім різних причин — не той ключ, не той формат, підмінене тіло. Тут
    // немає таємниць: публічний ключ на те й публічний, а з тіла беремо лише
    // довжину й invoiceId.
    const pubKeyB64 = await getMonoPubKey();
    const decoded = pubKeyB64 ? Buffer.from(pubKeyB64, 'base64').toString('utf8') : '';
    let keyType = 'не вдалось розібрати';
    try {
      if (decoded.includes('BEGIN PUBLIC KEY')) {
        const k = crypto.createPublicKey(decoded);
        keyType = `${k.asymmetricKeyType}/${k.asymmetricKeyDetails?.namedCurve ?? '?'}`;
      }
    } catch (e) {
      keyType = `помилка: ${e instanceof Error ? e.message : String(e)}`;
    }
    console.error('[monobank webhook] invalid signature', JSON.stringify({
      xSign:      signature?.slice(0, 24) ?? null,
      signLen:    signature ? Buffer.from(signature, 'base64').length : 0,
      pubKeyOk:   !!pubKeyB64,
      pubKeyHead: decoded.slice(0, 28),
      keyType,
      bodyLen:    rawBody.length,
      invoiceId:  (() => { try { return JSON.parse(rawBody).invoiceId ?? null; } catch { return null; } })(),
    }));
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
      // Idempotent on the Monobank invoiceId: a retried webhook no longer
      // double-credits the balance (unique index on external_ref).
      const extRef = `mono:topup:${body.invoiceId ?? reference}`;
      const { error: topupErr } = await serviceClient
        .from('partner_balance_transactions')
        .upsert({
          customer_id:  customerId,
          tx_type:      'top_up',
          amount:       amountUah,
          description:  `Поповнення карткою онлайн — ${amountUah.toFixed(2)} ₴`,
          created_by:   'monobank_webhook',
          external_ref: extRef,
        }, { onConflict: 'external_ref', ignoreDuplicates: true });
      if (topupErr) {
        alertAdmin('Monobank: не зараховано поповнення балансу партнера', {
          customerId, amount: amountUah, reference, error: topupErr.message,
        });
        return NextResponse.json({ error: 'top-up failed' }, { status: 500 });
      }
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
      // Чернетки немає — два зовсім різні випадки, які раніше зливалися в одне
      // мовчазне «ok»:
      //   1) замовлення вже створене попередньою доставкою вебхука — ідемпотентність;
      //   2) чернетки не було НІКОЛИ (або її встиг прибрати клінер) — тоді гроші
      //      списані, а замовлення не існує, і про це не дізнається ніхто.
      // Другий випадок 04.08 коштував нам замовлення на 104 ₴: клієнт оплатив,
      // замовлення не з'явилось, скаргу почули лише через три дні.
      const { data: existing } = await serviceClient
        .from('orders')
        .select('id, order_number')
        .eq('payment_reference', reference)
        .maybeSingle();

      if (existing) return NextResponse.json({ ok: true });

      alertAdmin('🚨 Monobank: оплата пройшла, а замовлення НЕМАЄ', {
        reference,
        amount: amountUah,
        invoiceId: body.invoiceId ?? null,
        hint: 'Чернетки в pending_card_orders немає. Оформіть замовлення вручну і поверніться до причини.',
      });
      // 500 — щоб Monobank повторив: якщо це гонка (оплата встигла раніше, ніж
      // закомітилась чернетка), наступна спроба вже знайде її і створить замовлення.
      return NextResponse.json({ error: 'draft not found' }, { status: 500 });
    }

    const { data: order, error: orderErr } = await serviceClient
      .from('orders')
      // Гроші вже списані — замовлення одразу оплачене. Без цих двох полів
      // картковий заказ висів у журналі як «Очікуємо оплату».
      .insert({
        ...draft.payload,
        status: 'confirmed',
        payment_reference: reference,
        payment_confirmed: true,
        amount_paid: amountUah,
      })
      .select('id, order_number, contact, company, phone, email, items, total_price, delivery_type, delivery_address, delivery_city_name, comment, channel_code')
      .single();

    if (orderErr || !order) {
      // Unique violation on payment_reference => a concurrent or previous
      // delivery already materialised this order. Idempotent success.
      if (orderErr?.code === '23505') {
        await serviceClient.from('pending_card_orders').delete().eq('id', pendingId);
        return NextResponse.json({ ok: true });
      }
      // Otherwise return 500 so Monobank retries; pending record is still intact
      console.error('[monobank webhook] order insert failed:', orderErr);
      notifyAdminOrderFailed(reference, draft.email, amountUah, orderErr?.message ?? 'unknown');
      return NextResponse.json({ error: 'order insert failed' }, { status: 500 });
    }

    // Order saved — now safe to remove the pending draft
    await serviceClient.from('pending_card_orders').delete().eq('id', pendingId);

    // Defense-in-depth: the paid amount must match the order total (KRIT-2 makes
    // the invoice server-priced, so a mismatch signals tampering/desync).
    if (typeof order.total_price === 'number' && Math.abs(amountUah - Number(order.total_price)) > 0.01) {
      notifyAdminOrderFailed(reference, order.email, amountUah,
        `Оплачено ${amountUah}₴, а сума замовлення ${order.total_price}₴ — перевірте вручну!`);
    }

    if (draft.payload?.promo_code) {
      await serviceClient.rpc('increment_promo_used', { p_code: draft.payload.promo_code });
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

  // ── Оплата РАХУНКУ існуючого замовлення (кнопка «Сплатити» на /invoice/[id]) ──
  const invoicePayMatch = reference?.match(/^invoice_([a-f0-9-]+)_\d+$/);
  if (invoicePayMatch) {
    const orderId = invoicePayMatch[1];

    const { data: order } = await serviceClient
      .from('orders')
      .select('id, order_number, customer_id, total_price, amount_paid, payment_type, contact, phone, email')
      .eq('id', orderId)
      .maybeSingle();
    if (!order) return NextResponse.json({ ok: true });

    // Ідемпотентність: повторний вебхук по тому ж mono-інвойсу — no-op
    const idemKey = `mono:invoice:${body.invoiceId ?? reference}`;
    const { data: already } = await serviceClient
      .from('money_entries')
      .select('id')
      .eq('idempotency_key', idemKey)
      .maybeSingle();
    if (already) return NextResponse.json({ ok: true });

    // Наложка вже не потрібна — клієнт оплатив наперед
    const newPaymentType = order.payment_type === 'cod' ? 'card' : order.payment_type;

    // Дебітор: якщо виручка вже проведена (РН) — та сама сторона, що в леджері;
    // інакше — та, на яку вона ляже при відгрузці (після зміни payment_type).
    let party: string | null = null;
    const { data: shipEntry } = await serviceClient
      .from('money_entries')
      .select('counterparty_id')
      .eq('order_id', orderId)
      .eq('account_type', 'customer')
      .eq('doc_type', 'sale')
      .gt('amount', 0)
      .limit(1)
      .maybeSingle();
    party = shipEntry?.counterparty_id ?? null;
    if (!party) {
      party = order.customer_id
        ?? (newPaymentType === 'cod' ? 'np:cod' : null);
      if (!party) {
        const { data: o2 } = await serviceClient
          .from('orders').select('channel_code').eq('id', orderId).single();
        party = o2?.channel_code === 'prom' ? 'mp:prom'
          : o2?.channel_code === 'rozetka' ? 'mp:rozetka'
          : 'guest';
      }
    }

    try {
      await recordCustomerPayment({
        customerId:     party,
        amount:         amountUah,
        paymentMethod:  'acquiring',
        businessDate:   businessDate(body),
        description:    `Оплата карткою онлайн (Monobank) — замовлення #${order.order_number}`,
        idempotencyKey: idemKey,
        createdBy:      'monobank_webhook',
      });
    } catch (err) {
      alertAdmin(`Monobank: оплату рахунку #${order.order_number} не записано в леджер`, err);
      return NextResponse.json({ error: 'ledger write failed' }, { status: 500 });
    }

    const newPaid = Math.round((Number(order.amount_paid ?? 0) + amountUah) * 100) / 100;
    await serviceClient.from('order_payments').insert({
      order_id:     orderId,
      amount:       amountUah,
      payment_mode: 'card',
      payment_date: businessDate(body),
      note:         `Monobank онлайн (${body.invoiceId ?? reference})`,
      created_by:   'monobank_webhook',
    });
    await serviceClient.from('orders').update({
      payment_confirmed: newPaid >= Number(order.total_price) - 0.01,
      amount_paid:       newPaid,
      payment_type:      newPaymentType,
    }).eq('id', orderId);

    resend.emails.send({
      from: FROM, to: ADMIN_EMAIL,
      subject: `💳 Рахунок оплачено! Замовлення №${order.order_number} — ${amountUah.toFixed(2)} ₴ (${order.contact}, ${order.phone})`,
      html: `<p>Клієнт оплатив рахунок карткою онлайн.</p>
             <p>Замовлення <strong>№${order.order_number}</strong> · сума <strong>${amountUah.toFixed(2)} ₴</strong> · оплачено разом ${newPaid.toFixed(2)} з ${Number(order.total_price).toFixed(2)} ₴</p>`,
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

function businessDate(body: { createdDate?: string; modifiedDate?: string }): string {
  // Monobank merchant webhooks send ISO strings createdDate/modifiedDate,
  // NOT a unix `createdAt` — the old field was always undefined.
  const raw = body.modifiedDate ?? body.createdDate;
  const ts = raw ? new Date(raw).getTime() : Date.now();
  return Number.isFinite(ts)
    ? new Date(ts).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
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
