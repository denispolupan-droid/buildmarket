import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { createServiceClient } from '../../../../lib/supabase';
import { buildAdminNotificationHtml } from '../../../../lib/invoice-email';
import { notifyAdminNewOrder } from '../../../../lib/telegram';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const {
    customerId,
    company, contact, phone, email,
    deliveryType, deliverySubtype, deliveryAddress,
    deliveryCityRef, deliveryCityName, deliveryWarehouseRef,
    paymentType, comment, items, totalPrice,
    channelCode,
  } = body;

  if (!contact?.trim()) return NextResponse.json({ error: 'Вкажіть контактну особу' }, { status: 400 });
  if (!Array.isArray(items) || items.length === 0) return NextResponse.json({ error: 'Додайте товари' }, { status: 400 });
  if (!['cod', 'invoice', 'cash'].includes(paymentType)) return NextResponse.json({ error: 'Невірний тип оплати' }, { status: 400 });

  const db = createServiceClient();

  const { data, error } = await db
    .from('orders')
    .insert({
      user_id:               null,
      customer_id:           customerId ?? null,
      company:               company ?? null,
      contact,
      phone:                 phone ?? '',
      email:                 email ?? '',
      delivery_type:         deliveryType ?? 'pickup',
      delivery_subtype:      deliverySubtype ?? null,
      delivery_address:      deliveryAddress ?? null,
      delivery_city_ref:     deliveryCityRef ?? null,
      delivery_city_name:    deliveryCityName ?? null,
      delivery_warehouse_ref: deliveryWarehouseRef ?? null,
      payment_type:          paymentType,
      status:                'new',
      comment:               comment ?? null,
      items,
      total_price:           totalPrice ?? items.reduce((s: number, i: { qty: number; price: number }) => s + i.qty * i.price, 0),
      channel_code:          channelCode ?? 'retail',
    })
    .select('id, order_number')
    .single();

  if (error) {
    console.error('[admin/orders POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const siteUrl   = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  const FROM      = 'FIXLINE <noreply@fixline.com.ua>';
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'denis.polupan@gmail.com';

  notifyAdminNewOrder({
    order_number:       data.order_number,
    contact,
    company:            company ?? null,
    phone:              phone ?? '',
    total_price:        totalPrice ?? 0,
    payment_type:       paymentType,
    delivery_city_name: deliveryCityName ?? null,
  });

  resend.emails.send({
    from: FROM, to: ADMIN_EMAIL,
    subject: `🏪 Ручне замовлення №${data.order_number} — ${contact} (${channelCode ?? 'retail'})`,
    html: buildAdminNotificationHtml({
      orderNumber: data.order_number, company: company ?? '', contact,
      phone: phone ?? '', email: email ?? '', items,
      totalPrice: totalPrice ?? 0, deliveryType: deliveryType ?? 'pickup',
      deliveryAddress: deliveryAddress ?? '', paymentType, comment,
    }),
  }).catch(e => console.error('[admin order email]', e));

  return NextResponse.json({ id: data.id, orderNumber: data.order_number, siteUrl });
}
