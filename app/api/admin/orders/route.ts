import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { createServiceClient } from '../../../../lib/supabase';
import { buildAdminNotificationHtml } from '../../../../lib/invoice-email';
import { notifyAdminNewOrder } from '../../../../lib/telegram';

const resend = new Resend(process.env.RESEND_API_KEY);

/** Find or create a customer record; returns { customerId, contractId } */
async function resolveCustomer(db: ReturnType<typeof createServiceClient>, opts: {
  customerId?: string | null;
  contact: string;
  phone?: string;
  email?: string;
  company?: string;
  totalPrice: number;
}): Promise<{ customerId: string | null; contractId: string | null }> {

  async function getOrCreateContract(customerId: string, name: string, type = 'retail'): Promise<string | null> {
    const { data: existing } = await db
      .from('customer_contracts')
      .select('id')
      .eq('customer_id', customerId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) return existing.id;

    const year = new Date().getFullYear();
    const contractNumber = `ДГ-${year}-${customerId.slice(0, 8).toUpperCase()}`;
    const { data: created } = await db.from('customer_contracts').insert({
      contract_number: contractNumber,
      customer_id:     customerId,
      customer_name:   name,
      credit_days:     0,
      credit_limit:    0,
      discount_pct:    0,
      allow_promo:     false,
      price_type:      type === 'retail' ? 'retail' : type,
      payment_terms:   'prepay',
      start_date:      new Date().toISOString().slice(0, 10),
      status:          'active',
      created_by:      'system',
      is_auto:         true,
    }).select('id').single();
    return created?.id ?? null;
  }

  // 1. Explicit customer_id passed from UI (selected from directory)
  if (opts.customerId) {
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
    const contractId = await getOrCreateContract(opts.customerId, opts.contact);
    return { customerId: opts.customerId, contractId };
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
      db.from('customers').update({
        orders_count:  found.orders_count  + 1,
        total_revenue: Number(found.total_revenue) + opts.totalPrice,
        last_order_at: new Date().toISOString(),
        ...(opts.contact && { name: opts.contact }),
        ...(opts.email   && { email: opts.email }),
        ...(opts.company && { company: opts.company }),
      }).eq('id', found.id).then(() => {});
      const contractId = await getOrCreateContract(found.id, opts.contact);
      return { customerId: found.id, contractId };
    }
  }

  // 3. Create new retail customer + default contract
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

  if (!created?.id) return { customerId: null, contractId: null };

  const contractId = await getOrCreateContract(created.id, opts.contact.trim(), 'retail');
  return { customerId: created.id, contractId };
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const {
    customerId: bodyCustomerId,
    company, contact, phone, email,
    deliveryType, deliverySubtype, deliveryAddress,
    deliveryCityRef, deliveryCityName, deliveryWarehouseRef,
    paymentType, comment, items, totalPrice,
    channelCode, createdAt,
  } = body;

  if (!contact?.trim()) return NextResponse.json({ error: 'Вкажіть контактну особу' }, { status: 400 });
  if (!Array.isArray(items) || items.length === 0) return NextResponse.json({ error: 'Додайте товари' }, { status: 400 });
  if (!['cod', 'invoice', 'cash'].includes(paymentType)) return NextResponse.json({ error: 'Невірний тип оплати' }, { status: 400 });

  // Дата замовлення. Потрібна для оформлення заднім числом (телефонне записали
  // наступного дня); від неї ж рахується дата в рахунку на оплату.
  //
  // Майбутню не приймаємо: замовлення, якого ще не було, ламає і сортування
  // журналу, і будь-який звіт за період. Час беремо поточний — так у списку
  // замовлення того самого дня стають у природному порядку.
  let createdAtIso: string | null = null;
  if (typeof createdAt === 'string' && createdAt.trim()) {
    const picked = new Date(`${createdAt}T${new Date().toISOString().slice(11)}`);
    if (Number.isNaN(picked.getTime())) {
      return NextResponse.json({ error: 'Некоректна дата замовлення' }, { status: 400 });
    }
    // Доба запасу — годинник браузера й сервера можуть розходитись на години,
    // і сьогоднішня дата з Києва не має відхилятись як «майбутня».
    if (picked.getTime() > Date.now() + 86_400_000) {
      return NextResponse.json({ error: 'Дата замовлення не може бути в майбутньому' }, { status: 400 });
    }
    createdAtIso = picked.toISOString();
  }

  const db = createServiceClient();
  const orderTotal = totalPrice ?? items.reduce((s: number, i: { qty: number; price: number }) => s + i.qty * i.price, 0);

  // Find or create customer — this ensures every manual order builds the CRM
  const { customerId: resolvedCustomerId, contractId: resolvedContractId } = await resolveCustomer(db, {
    customerId: bodyCustomerId,
    contact, phone, email, company,
    totalPrice: orderTotal,
  });

  const { data, error } = await db
    .from('orders')
    .insert({
      user_id:               null,
      customer_id:           resolvedCustomerId,
      contract_id:           resolvedContractId,
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
      // Без дати — лишаємо DEFAULT now() бази, а не час браузера
      ...(createdAtIso ? { created_at: createdAtIso } : {}),
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
