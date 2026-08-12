import { Resend } from 'resend';
import { buildCustomerOrderEmail, buildAdminNotificationHtml } from './invoice-email';
import { notifyAdminNewOrder } from './telegram';
import { alertAdmin } from './alert';

// Сповіщення про оплачене карткою замовлення: лист покупцю, лист і Telegram нам.
//
// Живе окремо, бо створити таке замовлення можуть ДВА шляхи — вебхук Monobank і
// звірка з випискою. Поки код лежав інлайном у вебхуку, замовлення, підняті
// звіркою, не давали покупцю жодного підтвердження: замовлення в базі є, гроші
// зараховані, а людина не знає нічого. Одна функція на обидва шляхи — щоб «лист
// не надіслали» не залежало від того, яким саме шляхом прийшло замовлення.

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = 'FIXLINE <noreply@fixline.com.ua>';

export type PaidCardOrder = {
  id: string;
  order_number: number;
  contact: string;
  company?: string | null;
  phone: string;
  email: string;
  items: unknown;
  total_price: number;
  delivery_type?: string | null;
  delivery_address?: string | null;
  delivery_city_name?: string | null;
  comment?: string | null;
};

export function notifyPaidCardOrder(order: PaidCardOrder): void {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://fixline.com.ua';
  const adminEmail = process.env.ADMIN_EMAIL ?? 'orders@fixline.com.ua';

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
    from: FROM, to: adminEmail,
    subject: `✅ Оплачено! Замовлення №${order.order_number} — ${order.contact} (${order.phone})`,
    html: buildAdminNotificationHtml({
      orderNumber: order.order_number, company: order.company ?? '',
      contact: order.contact, phone: order.phone, email: order.email,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items: order.items as any, totalPrice: order.total_price,
      deliveryType: order.delivery_type ?? '', deliveryAddress: order.delivery_address ?? '',
      paymentType: 'card', comment: order.comment ?? null,
    }),
    // Мовчазний catch тут коштував би того самого, що й у вебхуку: лист не пішов,
    // і ніхто не дізнався. Тому — в алерти.
  }).catch(err => alertAdmin(`Лист про оплату #${order.order_number} не пішов адміну`, err));

  resend.emails.send({
    from: FROM, to: order.email,
    subject: `✅ Оплату підтверджено! Замовлення №${order.order_number} — FIXLINE`,
    html: buildCustomerOrderEmail({
      orderNumber: order.order_number, orderId: order.id,
      company: order.company ?? '', contact: order.contact,
      totalPrice: order.total_price, paymentType: 'card',
      deliveryType: order.delivery_type ?? null,
      userId: null, invoiceUrl: `${siteUrl}/invoice/${order.id}`, siteUrl,
    }),
  }).catch(err => alertAdmin(`Лист про оплату #${order.order_number} не пішов покупцю (${order.email})`, err));
}
