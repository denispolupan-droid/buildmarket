import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createSupabaseServer, createSupabaseAdmin } from '../../../lib/supabase-server';
import { buildAdminNotificationHtml, buildCustomerOrderEmail } from '../../../lib/invoice-email';
import { notifyAdminNewOrder } from '../../../lib/telegram';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  const body = await req.json();
  const { company, contact, phone, email, deliveryType, deliverySubtype, deliveryAddress, deliveryCityRef, deliveryCityName, deliveryWarehouseRef, paymentType, comment, items, totalPrice } = body;

  // Server-side validation
  const phoneClean = String(phone ?? '').replace(/[\s\-()]/g, '');
  if (!contact?.trim()) return NextResponse.json({ error: 'Вкажіть контактну особу' }, { status: 400 });
  if (!/^\+?3?8?(0\d{9})$/.test(phoneClean)) return NextResponse.json({ error: 'Невірний номер телефону' }, { status: 400 });
  if (!email?.trim() || !email.includes('@')) return NextResponse.json({ error: 'Невірний email' }, { status: 400 });
  if (!deliveryType) return NextResponse.json({ error: 'Вкажіть тип доставки' }, { status: 400 });
  if (!paymentType) return NextResponse.json({ error: 'Вкажіть тип оплати' }, { status: 400 });
  if (!Array.isArray(items) || items.length === 0) return NextResponse.json({ error: 'Кошик порожній' }, { status: 400 });
  if (typeof totalPrice !== 'number' || totalPrice < 0) return NextResponse.json({ error: 'Невірна сума' }, { status: 400 });

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from('orders')
    .insert({
      user_id: user?.id ?? null,
      company,
      contact,
      phone,
      email,
      delivery_type: deliveryType,
      delivery_subtype: deliverySubtype ?? null,
      delivery_address: deliveryAddress ?? null,
      delivery_city_ref: deliveryCityRef ?? null,
      delivery_city_name: deliveryCityName ?? null,
      delivery_warehouse_ref: deliveryWarehouseRef ?? null,
      payment_type: paymentType,
      comment: comment ?? null,
      items,
      total_price: totalPrice,
    })
    .select('id, order_number')
    .single();

  if (error) {
    console.error('[orders]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Telegram: notify admin about new order (fire-and-forget)
  notifyAdminNewOrder({
    order_number: data.order_number,
    contact,
    company: company ?? null,
    phone,
    total_price: totalPrice,
    payment_type: paymentType,
    delivery_city_name: body.deliveryCityName ?? null,
  });

  // Mark abandoned cart as recovered (fire-and-forget)
  admin
    .from('abandoned_carts')
    .update({ recovered_at: new Date().toISOString() })
    .eq('email', email)
    .is('recovered_at', null)
    .then(() => {});

  const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'denis.polupan@gmail.com';
  const FROM = 'FIXLINE <noreply@fixline.com.ua>';
  const siteUrl = new URL(req.url).origin;
  const invoiceUrl = `${siteUrl}/invoice/${data.id}`;

  const orderData = {
    orderNumber: data.order_number,
    company: company ?? '',
    contact,
    phone,
    email,
    items,
    totalPrice,
    deliveryType,
    deliveryAddress: deliveryAddress ?? '',
    paymentType,
    comment,
  };

  try {
    await resend.emails.send({
      from: FROM,
      to: ADMIN_EMAIL,
      subject: `🛒 Нове замовлення №${data.order_number} — ${contact} (${phone})`,
      html: buildAdminNotificationHtml(orderData),
    });
  } catch (e) {
    console.error('[admin email]', e);
  }

  const customerSubject = paymentType === 'cod'
    ? `Замовлення №${data.order_number} оформлено — FIXLINE`
    : `Рахунок №${data.order_number} — FIXLINE`;

  try {
    await resend.emails.send({
      from: FROM,
      to: email,
      subject: customerSubject,
      html: buildCustomerOrderEmail({
        orderNumber: data.order_number,
        orderId: data.id,
        company: company ?? '',
        contact,
        totalPrice,
        paymentType,
        userId: user?.id ?? null,
        invoiceUrl,
        siteUrl,
        telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME,
      }),
    });
  } catch (e) {
    console.error('[customer email]', e);
  }

  return NextResponse.json({ id: data.id, orderNumber: data.order_number });
}
