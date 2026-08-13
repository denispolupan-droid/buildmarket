import { Resend } from 'resend';
import { createServiceClient } from '../supabase';
import { notifyCustomer } from './send';
import { notifyCustomerStatus } from '../telegram';
import { buildCustomerStatusEmail } from '../invoice-email';
import { SITE_URL } from '../site';

// Фан-аут подій посилки («перевізник прийняв» / «прибула, чекає на отримувача»)
// в усі канали покупця: SMS/Viber + Telegram + email.
//
// Викликається з крона доставки, який бачить той самий статус ЩОПІВГОДИНИ, тому
// кожен канал столбить свою подію в customer_notifications (той самий механізм
// «одна подія — одне повідомлення», що й у SMS) під власним ключем:
// 'shipped:telegram', 'arrived:email' і т.д. SMS-канал клеймить власні
// 'shipped'/'arrived' всередині notifyCustomer.

type ParcelOrder = {
  id: string;
  order_number: number;
  phone: string | null;
  email: string | null;
  contact: string | null;
  company: string | null;
  telegram_chat_id: string | null;
  tracking_number: string | null;
  delivery_type: string | null;
};

/** true = подію застовпили ми (слати можна); false = вже слали або збій клейму */
async function claim(orderId: string, event: string, address: string, body: string, channel: string): Promise<boolean> {
  const db = createServiceClient();
  const now = new Date().toISOString();
  const { error } = await db.from('customer_notifications').insert({
    order_id: orderId, event, phone: address, body, channel, status: 'sent', sent_at: now,
  });
  if (!error) return true;
  if (error.code === '23505') {
    // Рядок уже є: пробуємо ще раз лише те, що впало минулого разу
    const { data: prev } = await db.from('customer_notifications')
      .select('status').eq('order_id', orderId).eq('event', event).maybeSingle();
    if (prev?.status === 'failed') {
      await db.from('customer_notifications')
        .update({ status: 'sent', sent_at: now, error: null })
        .eq('order_id', orderId).eq('event', event);
      return true;
    }
    return false;
  }
  console.error('[notify-parcel] claim failed:', event, error.message);
  return false; // клейм не пройшов — краще змовчати, ніж ризикувати дублями
}

async function markFailed(orderId: string, event: string, message: string): Promise<void> {
  const db = createServiceClient();
  await db.from('customer_notifications')
    .update({ status: 'failed', error: message.slice(0, 500) })
    .eq('order_id', orderId).eq('event', event);
}

export async function notifyParcelEvent(order: ParcelOrder, event: 'shipped' | 'arrived'): Promise<void> {
  const num = order.order_number;

  // SMS/Viber (зараз вимкнено налаштуванням notify_provider — виклик стане
  // живим одразу після його заповнення, без правок коду)
  notifyCustomer({
    orderId: order.id,
    phone:   order.phone,
    event,
    ctx: {
      orderNumber:    num,
      trackingNumber: order.tracking_number,
      carrier:        order.delivery_type === 'rz_delivery' ? 'rozetka' : 'nova',
    },
  }).catch((err: unknown) => console.error('[notify-parcel] sms failed:', order.id, err));

  // Telegram — якщо покупець прив'язав бота
  if (order.telegram_chat_id) {
    if (await claim(order.id, `${event}:telegram`, order.telegram_chat_id, `tg:${event} №${num}`, 'telegram')) {
      notifyCustomerStatus(order.telegram_chat_id, num, event, order.tracking_number, order.delivery_type);
    }
  }

  // Email — той самий шаблон статусних листів, що й при ручній зміні статусу
  if (order.email) {
    const html = buildCustomerStatusEmail({
      orderNumber: num,
      contact:  order.contact ?? '',
      company:  order.company ?? '',
      status:   event,
      trackingNumber: order.tracking_number,
      deliveryType:   order.delivery_type,
      siteUrl:  SITE_URL,
    });
    if (html && await claim(order.id, `${event}:email`, order.email, `email:${event} №${num}`, 'email')) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const subject = event === 'shipped'
        ? `Замовлення №${num} відправлено — FIXLINE`
        : `Посилка №${num} чекає на вас — FIXLINE`;
      const { error } = await resend.emails.send({
        from: 'FIXLINE <noreply@fixline.com.ua>', to: order.email, subject, html,
      });
      if (error) {
        console.error('[notify-parcel] email failed:', order.id, error);
        await markFailed(order.id, `${event}:email`, error.message ?? String(error));
      }
    }
  }
}
