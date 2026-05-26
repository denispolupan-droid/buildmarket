import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { createServiceClient } from '../../../../lib/supabase';
import { buildAdminNotificationHtml } from '../../../../lib/invoice-email';
import { notifyAdminNewOrder } from '../../../../lib/telegram';

const resend = new Resend(process.env.RESEND_API_KEY);

/** Find or create a customer record; returns customer UUID or null */
async function resolveCustomer(db: ReturnType<typeof createServiceClient>, opts: {
  customerId?: string | null;
  contact: string;
  phone?: string;
  email?: string;
  company?: string;
  totalPrice: number;
}): Promise<string | null> {
  // 1. Explicit customer_id passed from UI (selected from directory)
  if (opts.customerId) {
    // Increment counters asynchronously (don't await)
    db.from('customers').select('orders_count, total_revenue').eq('id', opts.customerId).single()
      .then(({ data }) => {
        if (data) {
          db.from('customers').update({
            orders_count:  data.orders_count  + 1,
            total_revenue: Number(data.total_revenue) + opts.totalPrice,
            last_order_at: new Date().toISOString(),
          }).eq('id', opts.customerId!).then(() => {});
        }
      });
    return opts.customerId;
  }

  // 2. Try to find by phone (most reliable match for retail)
  const cleanPhone = opts.phone?.replace(/\s+/g, '').replace(/[()]/g, '') ?? '';
  if (cleanPhone.length >= 9) {
    const { data: found } = await db
      .from('customers')
      .select('id, orders_count, total_revenue')
      .or(`phone.eq.${opts.phone},phone.eq.${cleanPhone}`)
      .limit(1)
      .single();

    if (found) {
      // Update stats
      db.from('customers').update({
        orders_count:  found.orders_count  + 1,
        total_revenue: Number(found.total_revenue) + opts.totalPrice,
        last_order_at: new Date().toISOString(),
        // Also update name/email if we have better data
        ...(opts.contact && { name: opts.contact }),
        ...(opts.email   && { email: opts.email }),
        ...(opts.company && { company: opts.company }),
      }).eq('id', found.id).then(() => {});
      return found.id;
    }
  }

  // 3. Create new retail customer
  const { data: created } = await db.from('customers').insert({
    name:          opts.contact.trim(),
    phone:         opts.phone?.trim()   || null,
    email:         opts.email?.trim()   || null,
    company:       opts.company?.trim() || null,
    type:          'retail',
    price_tier:    'retail',
    is_active:     true,
    orders_count:  1,
    total_revenue: opts.totalPrice,
    last_order_at: new Date().toISOString(),
    balance:       0,
    balance_held:  0,
    meta:          {},
  }).select('id').single();

  return created?.id ?? null;
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const {
    customerId: bodyCustomerId,
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
  const orderTotal = totalPrice ?? items.reduce((s: number, i: { qty: number; price: number }) => s + i.qty * i.price, 0);

  // Find or create customer — this ensures every manual order builds the CRM
  const resolvedCustomerId = await resolveCustomer(db, {
    customerId: bodyCustomerId,
    contact, phone, email, company,
    totalPrice: orderTotal,
  });

  const { data, error } = await db
    .from('orders')
    .insert({
      user_id:               null,
      customer_id:           resolvedCustomerId,
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
      total_price:           orderTotal,
      channel_code:          channelCode ?? 'retail',
    })
    .select('id, order_number')
    .single();

  if (error) {
    console.error('[admin/orders POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const siteUrl     = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  const FROM        = 'FIXLINE <noreply@fixline.com.ua>';
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'orders@fixline.com.ua';

  notifyAdminNewOrder({
    order_number:       data.order_number,
    contact,
    company:            company ?? null,
    phone:              phone ?? '',
    total_price:        orderTotal,
    payment_type:       paymentType,
    delivery_city_name: deliveryCityName ?? null,
  });

  resend.emails.send({
    from: FROM, to: ADMIN_EMAIL,
    subject: `🏪 Ручне замовлення №${data.order_number} — ${contact} (${channelCode ?? 'retail'})`,
    html: buildAdminNotificationHtml({
      orderNumber: data.order_number, company: company ?? '', contact,
      phone: phone ?? '', email: email ?? '', items,
      totalPrice: orderTotal, deliveryType: deliveryType ?? 'pickup',
      deliveryAddress: deliveryAddress ?? '', paymentType, comment,
    }),
  }).catch(e => console.error('[admin order email]', e));

  return NextResponse.json({ id: data.id, orderNumber: data.order_number, siteUrl });
}
