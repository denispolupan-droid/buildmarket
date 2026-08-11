import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createSupabaseServer, createSupabaseAdmin } from '../../../lib/supabase-server';
import { buildAdminNotificationHtml, buildCustomerOrderEmail } from '../../../lib/invoice-email';
import { notifyAdminNewOrder, notifyCustomerNewOrder } from '../../../lib/telegram';
import { rateLimit, getClientIp } from '../../../lib/rate-limit';
import { WHOLESALE_MIN } from '../../../lib/site';
import { alertAdmin } from '../../../lib/alert';
import { findOrCreateCustomerForOrder } from '../../../lib/customers';
import { repriceItems, applyPromoCode, type RepriceItem, type PriceRow, type PromoCodeRow } from '../../../lib/pricing';
import type { CartItem } from '../../../types';
import { getMonoAcquiringToken } from '../../../lib/mono-config';
import { RZ_DELIVERY_TYPE } from '../../../lib/rz-delivery';
import { getRzSender, isRzDeliveryEnabled } from '../../../lib/rz-delivery-api';
import { cartWeightKg } from '../../../lib/parcel-weight';

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
          deliveryCityRef, deliveryCityName, deliveryWarehouseRef, paymentType, comment, items,
          promoCode,
          utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer_url } = body;

  const phoneClean = String(phone ?? '').replace(/[\s\-()]/g, '');
  if (!contact?.trim())   return NextResponse.json({ error: 'Вкажіть контактну особу' }, { status: 400 });
  if (!/^\+?3?8?(0\d{9})$/.test(phoneClean)) return NextResponse.json({ error: 'Невірний номер телефону' }, { status: 400 });
  if (!email?.trim() || !email.includes('@')) return NextResponse.json({ error: 'Невірний email' }, { status: 400 });
  if (!deliveryType)  return NextResponse.json({ error: 'Вкажіть тип доставки' }, { status: 400 });
  if (!paymentType)   return NextResponse.json({ error: 'Вкажіть тип оплати' }, { status: 400 });
  if (!Array.isArray(items) || items.length === 0) return NextResponse.json({ error: 'Кошик порожній' }, { status: 400 });

  const WHOLESALE_TYPES = ['dealer', 'wholesale', 'contractor', 'shop_owner'];
  const accountType = user?.app_metadata?.account_type as string | undefined;

  const admin  = createSupabaseAdmin();

  // ── Server-side re-pricing: NEVER trust client item prices or totals ───────
  //    Every line price is recomputed from product_stock by SKU for the user's
  //    tier (retail: price_promo ?? price_retail; wholesale: price_unit).
  const isWholesaleUser = WHOLESALE_TYPES.includes(accountType ?? '');
  type OrderItem = { sku?: unknown; qty?: unknown; [k: string]: unknown };
  const rawItems = items as OrderItem[];
  const skus: string[] = [];
  for (const it of rawItems) {
    if (typeof it?.sku !== 'string' || !it.sku.trim())
      return NextResponse.json({ error: 'Некоректний товар у кошику' }, { status: 400 });
    const q = Number(it.qty);
    if (!Number.isInteger(q) || q <= 0 || q > 100000)
      return NextResponse.json({ error: 'Некоректна кількість товару' }, { status: 400 });
    skus.push(it.sku);
  }

  // «ROZETKA Доставка»: точка видачі обов'язкова, і посилка має влізти в ліміт
  // НАШОГО складу здачі. Чекаут це вже фільтрує, але тіло запиту приходить з
  // браузера, а ціна помилки асиметрична: тут покупець ще бачить зрозумілий
  // текст і може обрати НП, а при створенні накладної замовлення вже оплачене.
  if (deliveryType === RZ_DELIVERY_TYPE) {
    // Рубільник перевіряємо і тут: сторінку кошика могли відкрити ДО того, як
    // доставку вимкнули, і вона так і лишиться з живою опцією у вкладці.
    if (!await isRzDeliveryEnabled())
      return NextResponse.json({ error: 'ROZETKA Доставка тимчасово недоступна. Оберіть Нову Пошту.' }, { status: 400 });
    if (!deliveryWarehouseRef || !deliveryCityRef)
      return NextResponse.json({ error: 'Оберіть точку видачі ROZETKA' }, { status: 400 });
    const limit = (await getRzSender())?.weight_limit_kg ?? null;
    if (limit != null) {
      const { data: vols } = await admin.from('products').select('sku, volume').in('sku', skus);
      const volBySku = new Map((vols ?? []).map(v => [v.sku, v.volume as string | null]));
      const weightKg = cartWeightKg(
        rawItems.map(it => ({ volume: volBySku.get(String(it.sku)) ?? null, qty: Number(it.qty) })),
      );
      if (weightKg > limit)
        return NextResponse.json({
          error: `Замовлення важче за ${limit} кг — ROZETKA Доставка недоступна. Оберіть Нову Пошту.`,
        }, { status: 400 });
    }
  }

  const { data: priceRows, error: priceErr } = await admin
    .from('product_stock')
    .select('sku, price_promo, price_retail, price_unit')
    .in('sku', skus);
  if (priceErr)
    return NextResponse.json({ error: 'Не вдалось перевірити ціни. Спробуйте ще раз.' }, { status: 500 });

  const priceBySku = new Map((priceRows ?? []).map(r => [r.sku, r]));

  const priced = repriceItems(rawItems as RepriceItem[], priceBySku as Map<string, PriceRow>, isWholesaleUser);
  if (!priced.ok) return NextResponse.json({ error: priced.error }, { status: 400 });
  const { serverTotal, serverEligibleTotal, serverItems } = priced;

  // ── Promo code: validate server-side and compute final total ─────────────
  let finalTotal      = serverTotal;
  let promoDiscount:  number | null = null;
  let resolvedPromoCode: string | null = null;

  if (promoCode) {
    const { data: promo } = await admin.from('promo_codes')
      .select('*').eq('code', String(promoCode).toUpperCase().trim()).eq('is_active', true).maybeSingle();
    if (!promo)
      return NextResponse.json({ error: 'Промокод не знайдено або неактивний' }, { status: 400 });
    const applied = applyPromoCode(promo as PromoCodeRow, serverTotal, serverEligibleTotal, new Date());
    if (!applied.ok) return NextResponse.json({ error: applied.error }, { status: 400 });
    finalTotal = applied.finalTotal;
    promoDiscount = applied.promoDiscount;
    resolvedPromoCode = applied.code;
  }

  if (WHOLESALE_TYPES.includes(accountType ?? '') && finalTotal < WHOLESALE_MIN) {
    return NextResponse.json({ error: 'Мінімальна сума оптового замовлення — 3 000 ₴' }, { status: 400 });
  }
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;

  // Контрагент для довідника: матч/створення за акаунтом → email → телефоном.
  // null не блокує оформлення — замовлення важливіше за довідник.
  const customerId = await findOrCreateCustomerForOrder({
    contact,
    company:     company ?? null,
    phone,
    email,
    authUserId:  user?.id ?? null,
    accountType: (user?.app_metadata?.account_type as string | undefined) ?? null,
  });
  const FROM    = 'FIXLINE <noreply@fixline.com.ua>';
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'orders@fixline.com.ua';

  // ── Card payment: save draft, create Monobank invoice, DO NOT insert into orders ──
  if (paymentType === 'card') {
    const pendingId = crypto.randomUUID();
    const reference = `pending_${pendingId}_${Date.now()}`;

    // Чернетка ПЕРЕД інвойсом. Раніше спершу створювався інвойс Monobank, і лише
    // потім писалась чернетка: якщо запис падав, посилання на оплату вже існувало —
    // клієнт міг заплатити за замовлення, чернетки якого немає, а вебхуку не було з
    // чого його створити. Тепер, якщо інвойс не вийде, зайву чернетку просто прибираємо.
    const payload = {
      user_id:               user?.id ?? null,
      customer_id:           customerId,
      price_type:            isWholesaleUser ? 'wholesale' : 'retail',
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
      items:                 serverItems,
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
      total_price: serverTotal,
      email,
    });
    if (pendingErr) {
      alertAdmin('Checkout: не збереглось pending_card_orders (картка)', { email, reference, error: pendingErr.message });
      return NextResponse.json({ error: 'Помилка збереження замовлення. Спробуйте ще раз.' }, { status: 500 });
    }

    const token = getMonoAcquiringToken();
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
      // Оплати не буде — чернетка ні до чого; лишати її означало б тримати
      // «замовлення-привид», яке нікому не належить.
      await admin.from('pending_card_orders').delete().eq('id', pendingId);
      return NextResponse.json({ error: 'Не вдалось ініціювати оплату. Спробуйте ще раз або оберіть інший спосіб оплати.' }, { status: 500 });
    }

    await admin.from('abandoned_carts')
      .update({ recovered_at: new Date().toISOString() })
      .eq('email', email).is('recovered_at', null);

    return NextResponse.json({ pageUrl });
  }

  // ── COD / Invoice: insert order immediately ───────────────────────────────
  const { data, error } = await admin
    .from('orders')
    .insert({
      user_id: user?.id ?? null,
      customer_id: customerId,
      price_type: isWholesaleUser ? 'wholesale' : 'retail',
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
      items:          serverItems,
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
    alertAdmin('Checkout: не збереглось замовлення (безготівка)', { email, contact, total: finalTotal, error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (resolvedPromoCode) {
    // await: fire-and-forget is dropped when the serverless instance freezes
    // after the response, so max_uses would never be enforced.
    await admin.rpc('increment_promo_used', { p_code: resolvedPromoCode });
  }

  await admin.from('abandoned_carts')
    .update({ recovered_at: new Date().toISOString() })
    .eq('email', email).is('recovered_at', null);

  const invoiceUrl = `${siteUrl}/invoice/${data.id}`;

  const orderData = {
    orderNumber: data.order_number, company: company ?? '', contact,
    phone, email, items: serverItems as unknown as CartItem[], totalPrice: finalTotal, deliveryType,
    deliveryAddress: deliveryAddress ?? '', paymentType, comment,
  };

  notifyAdminNewOrder({
    order_number:       data.order_number,
    contact,
    company:            company ?? null,
    phone,
    total_price:        finalTotal,
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

  // Customer gets both channels whenever both are available — Telegram alone isn't
  // reliable enough to skip email (chat_id could be stale, bot could be blocked),
  // and email alone means a returning customer with Telegram linked misses the
  // faster/more-visible channel they already opted into.
  if (existingChatId) {
    await admin.from('orders').update({ telegram_chat_id: existingChatId }).eq('id', data.id);
    notifyCustomerNewOrder(existingChatId, {
      order_number: data.order_number, items: serverItems as unknown as CartItem[], total_price: finalTotal,
      payment_type: paymentType, delivery_city_name: deliveryCityName ?? null,
      invoice_url: paymentType === 'invoice' ? invoiceUrl : undefined,
    });
  }

  const customerSubject = paymentType === 'cod'
    ? `Замовлення №${data.order_number} оформлено — FIXLINE`
    : `Рахунок №${data.order_number} — FIXLINE`;
  resend.emails.send({
    from: FROM, to: email, subject: customerSubject,
    html: buildCustomerOrderEmail({
      orderNumber: data.order_number, orderId: data.id,
      company: company ?? '', contact, totalPrice: finalTotal, paymentType,
      userId: user?.id ?? null, invoiceUrl, siteUrl,
      telegramBotUsername: existingChatId ? undefined : process.env.TELEGRAM_BOT_USERNAME,
    }),
  }).catch(e => console.error('[customer email]', e));

  return NextResponse.json({ id: data.id, orderNumber: data.order_number });
}
