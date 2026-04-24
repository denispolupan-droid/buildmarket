import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createSupabaseServer, createSupabaseAdmin } from '../../../lib/supabase-server';
import { buildInvoiceHtml, buildAdminNotificationHtml, buildCustomerConfirmationHtml } from '../../../lib/invoice-email';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  const body = await req.json();
  const { company, contact, phone, email, deliveryType, deliverySubtype, deliveryAddress, paymentType, comment, items, totalPrice } = body;

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

  const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'denis.polupan@gmail.com';
  const FROM = 'FIXLINE <noreply@fixline.com.ua>';

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
    // Always notify admin
    await resend.emails.send({
      from: FROM,
      to: ADMIN_EMAIL,
      subject: `🛒 Нове замовлення №${data.order_number} — ${contact} (${phone})`,
      html: buildAdminNotificationHtml(orderData),
    });
  } catch (e) {
    console.error('[admin email]', e);
  }

  try {
    if (paymentType === 'invoice') {
      // Send invoice for bank transfer
      await resend.emails.send({
        from: FROM,
        to: email,
        subject: `Рахунок-фактура №${data.order_number} — FIXLINE`,
        html: buildInvoiceHtml({
          orderId: data.id,
          orderNumber: data.order_number,
          company: company ?? '',
          contact,
          phone,
          email,
          items,
          totalPrice,
          deliveryAddress: deliveryAddress ?? '',
        }),
      });
    } else {
      // Send confirmation for COD
      await resend.emails.send({
        from: FROM,
        to: email,
        subject: `Замовлення №${data.order_number} прийнято — FIXLINE`,
        html: buildCustomerConfirmationHtml(orderData),
      });
    }
  } catch (e) {
    console.error('[customer email]', e);
  }

  return NextResponse.json({ id: data.id, orderNumber: data.order_number });
}
