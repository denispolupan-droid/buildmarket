import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createSupabaseServer, createSupabaseAdmin } from '../../../lib/supabase-server';
import { buildAdminNotificationHtml, buildCustomerOrderEmail } from '../../../lib/invoice-email';
import { notifyAdminNewOrder, notifyCustomerNewOrder } from '../../../lib/telegram';
import { rateLimit, getClientIp } from '../../../lib/rate-limit';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  // Rate limit: 10 order submissions per IP per hour (prevents cart-spam / payment link flood)
  const ip = getClientIp(req);
  if (!rateLimit(`orders:${ip}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Занадто багато запитів. Спробуйте пізніше.' }, { status: 429 });
  }

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  const body = await req.json();
  const { company, contact, phone, email, deliveryType, deliverySubtype, deliveryAddress,
          deliveryCityRef, deliveryCityName, deliveryWarehouseRef, paymentType, comment, items, totalPrice,
          promoCode, promoEligibleTotal,
          utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer_url } = body;

  const phoneClean = String(phone ?? '').replace(/[\s\-()]/g, '');
  if (!contact?.trim())   return NextResponse.json({ error: 'Вкажіть контактну особу' }, { status: 400 });
  if (!/^\+?3?8?(0\d{9})$/.test(phoneClean)) return NextResponse.json({ error: 'Невірний номер телефону' }, { status: 400 });
  if (!email?.trim() || !email.includes('@')) return NextResponse.json({ error: 'Невірний email' }, { status: 400 });
  if (!deliveryType)  return NextResponse.json({ error: 'Вкажіть тип доставки' }, { status: 400 });
  if (!paymentType)   return NextResponse.json({ error: 'Вкажіть тип оплати' }, { status: 400 });
  if (!Array.isArray(items) || items.length === 0) return NextResponse.json({ error: 'Кошик порожній' }, { status: 400 });
  if (typeof totalPrice !== 'number' || totalPrice < 0) return NextResponse.json({ error: 'Невірна сума' }, { status: 400 });

  const WHOLESALE_TYPES = ['dealer', 'wholesale', 'contractor', 'shop_owner'];
  const accountType = user?.user_metadata?.account_type as string | undefined;

  const admin  = createSupabaseAdmin();

  // ── Promo code: validate server-side and compute final total ─────────────
  let finalTotal      = totalPrice as number;
  let promoDiscount:  number | null = null;
  let resolvedPromoCode: string | null = null;

  if (promoCode) {
    const { data: promo } = await admin.from('promo_codes')
      .select('*').eq('code', String(promoCode).toUpperCase().trim()).eq('is_active', true).maybeSingle();
    if (!promo)
      return NextResponse.json({ error: 'Промокод не знайдено або неактивний' }, { status: 400 });
    const now = new Date();
    if (promo.valid_from && new Date(promo.valid_from) > now)
      return NextResponse.json({ error: 'Промокод ще не діє' }, { status: 400 });
    if (promo.valid_until && new Date(promo.valid_until) < now)
      return NextResponse.json({ error: 'Термін дії промокоду закінчився' }, { status: 400 });
    if (promo.max_uses !== null && promo.uses_count >= promo.max_uses)
      return NextResponse.json({ error: 'Промокод вичерпано' }, { status: 400 });
    if (promo.min_order_amount && totalPrice < promo.min_order_amount)
      return NextResponse.json({ error: `Мінімальна сума для цього промокоду — ${promo.min_order_amount} ₴` }, { status: 400 });
    const discountBase = (typeof promoEligibleTotal === 'number' && promoEligibleTotal > 0)
      ? promoEligibleTotal
      : totalPrice;
    promoDiscount = promo.discount_type === 'percent'
      ? Math.round(discountBase * promo.discount_value / 100 * 100) / 100
      : Math.min(Number(promo.discount_value), discountBase);
    if (promo.max_discount_amount && promoDiscount > promo.max_discount_amount)
      promoDiscount = promo.max_discount_amount;
    finalTotal = Math.max(0, totalPrice - (promoDiscount ?? 0));
    resolvedPromoCode = promo.code;
  }

  if (WHOLESALE_TYPES.includes(accountType ?? '') && finalTotal < 3000) {
    return NextResponse.json({ error: 'Мінімальна сума оптового замовлення — 3 000 ₴' }, { status: 400 });
  }
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  const FROM    = 'FIXLINE <noreply@fixline.com.ua>';
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'orders@fixline.com.ua';

  // ── Card payment: save draft, create Monobank invoice, DO NOT insert into orders ──
  if (paymentType === 'card') {
    const pendingId = crypto.randomUUID();
    const reference = `pending_${pendingId}_${Date.now()}`;

    const token = (process.env.MONOBANK_API_TOKEN ?? '').replace(/[^\x20-\x7E]/g, '').trim();
    let pageUrl: string | null = null;
    try {
      const monoRes  = await fetch('https://api.monobank.ua/api/merchant/invoice/create', {
        method: 'POST',
        headers: { 'X-Token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount:   Math.round(finalTotal * 100),
          ccy:      980,
          merchantPaymInfo: {
            reference,
            destination: `Замовлення — FIXLINE`,
            comment:     `Замовлення — FIXLINE`,
          },
          redirectUrl: `${siteUrl}/order-success?paid=1`,
          webHookUrl:  `${siteUrl}/api/webhooks/monobank`,
        }),
      });
      const monoData = await monoRes.json();
      if (monoRes.ok && monoData.pageUrl) {
        pageUrl = monoData.pageUrl;
      } else {
        console.error('[monobank invoice]', monoData);
      }
    } catch (e) {
      console.error('[monobank invoice]', e);
    }

    if (!pageUrl) {
      return NextResponse.json({ error: 'Не вдалось ініціювати оплату. Спробуйте ще раз або оберіть інший спосіб оплати.' }, { status: 500 });
    }

    // Save pending draft — order only materialises after webhook confirms payment
    const payload = {
      user_id:               user?.id ?? null,
      company:               company ?? null,
      contact,
      phone,
      email,
      delivery_type:         deliveryType,
      delivery_subtype:      deliverySubtype ?? null,
      delivery_address:      deliveryAddress ?? null,
      delivery_city_ref:     deliveryCityRef ?? null,
      delivery_city_name:    deliveryCityName ?? null,
      delivery_warehouse_ref: deliveryWarehouseRef ?? null,
      payment_type:          'card',
      comment:               comment ?? null,
      items,
      total_price:           finalTotal,
      promo_code:            resolvedPromoCode,
      promo_discount:        promoDiscount,
      utm_source:            utm_source ?? null,
      utm_medium:            utm_medium ?? null,
      utm_campaign:          utm_campaign ?? null,
      utm_content:           utm_content ?? null,
      utm_term:              utm_term ?? null,
      referrer_url:          referrer_url ?? null,
    };

    const { error: pendingErr } = await admin.from('pending_card_orders').insert({
      id:          pendingId,
      user_id:     user?.id ?? null,
      payload,
      reference,
      total_price: totalPrice,
      email,
    });
    if (pendingErr) {
      console.error('[pending_card_orders] insert failed:', pendingErr);
      return NextResponse.json({ error: 'Помилка збереження замовлення. Спробуйте ще раз.' }, { status: 500 });
    }

    admin.from('abandoned_carts')
      .update({ recovered_at: new Date().toISOString() })
      .eq('email', email).is('recovered_at', null).then(() => {});

    return NextResponse.json({ pageUrl });
  }

  // ── COD / Invoice: insert order immediately ───────────────────────────────
  const { data, error } = await admin
    .from('orders')
    .insert({
      user_id: user?.id ?? null,
      company,
      contact,
      phone,
      email,
      delivery_type:         deliveryType,
      delivery_subtype:      deliverySubtype ?? null,
      delivery_address:      deliveryAddress ?? null,
      delivery_city_ref:     deliveryCityRef ?? null,
      delivery_city_name:    deliveryCityName ?? null,
      delivery_warehouse_ref: deliveryWarehouseRef ?? null,
      payment_type:   paymentType,
      status:         'new',
      comment:        comment ?? null,
      items,
      total_price:    finalTotal,
      promo_code:     resolvedPromoCode,
      promo_discount: promoDiscount,
      utm_source:     utm_source ?? null,
      utm_medium:     utm_medium ?? null,
      utm_campaign:   utm_campaign ?? null,
      utm_content:    utm_content ?? null,
      utm_term:       utm_term ?? null,
      referrer_url:   referrer_url ?? null,
    })
    .select('id, order_number')
    .single();

  if (error) {
    console.error('[orders]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (resolvedPromoCode) {
    admin.rpc('increment_promo_used', { p_code: resolvedPromoCode }).then(() => {});
  }

  admin.from('abandoned_carts')
    .update({ recovered_at: new Date().toISOString() })
    .eq('email', email).is('recovered_at', null).then(() => {});

  const invoiceUrl = `${siteUrl}/invoice/${data.id}`;

  const orderData = {
    orderNumber: data.order_number, company: company ?? '', contact,
    phone, email, items, totalPrice, deliveryType,
    deliveryAddress: deliveryAddress ?? '', paymentType, comment,
  };

  notifyAdminNewOrder({
    order_number:       data.order_number,
    contact,
    company:            company ?? null,
    phone,
    total_price:        totalPrice,
    payment_type:       paymentType,
    delivery_city_name: body.deliveryCityName ?? null,
  });

  resend.emails.send({
    from: FROM, to: ADMIN_EMAIL,
    subject: `🛒 Нове замовлення №${data.order_number} — ${contact} (${phone})`,
    html: buildAdminNotificationHtml(orderData),
  }).catch(e => console.error('[admin email]', e));

  const { data: prevOrder } = await admin
    .from('orders').select('telegram_chat_id')
    .eq('email', email).neq('id', data.id)
    .not('telegram_chat_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1).maybeSingle();

  const existingChatId = prevOrder?.telegram_chat_id ?? null;

  if (existingChatId) {
    await admin.from('orders').update({ telegram_chat_id: existingChatId }).eq('id', data.id);
    notifyCustomerNewOrder(existingChatId, {
      order_number: data.order_number, items, total_price: totalPrice,
      payment_type: paymentType, delivery_city_name: deliveryCityName ?? null,
      invoice_url: paymentType === 'invoice' ? invoiceUrl : undefined,
    });
  } else {
    const customerSubject = paymentType === 'cod'
      ? `Замовлення №${data.order_number} оформлено — FIXLINE`
      : `Рахунок №${data.order_number} — FIXLINE`;
    resend.emails.send({
      from: FROM, to: email, subject: customerSubject,
      html: buildCustomerOrderEmail({
        orderNumber: data.order_number, orderId: data.id,
        company: company ?? '', contact, totalPrice, paymentType,
        userId: user?.id ?? null, invoiceUrl, siteUrl,
        telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME,
      }),
    }).catch(e => console.error('[customer email]', e));
  }

  return NextResponse.json({ id: data.id, orderNumber: data.order_number });
}
