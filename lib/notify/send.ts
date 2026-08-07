import { createServiceClient } from '../supabase';
import { alertAdmin } from '../alert';
import { normalizePhone } from './phone';
import { buildMessage, type NotifyEvent, type NotifyContext } from './templates';
import { getNotifyConfig, sendMessage } from './provider';

// Відправка сповіщення покупцю з гарантією «одна подія — одне повідомлення».
//
// Порядок навмисний: спершу КЛЕЙМ рядка в customer_notifications (унікальний
// індекс order_id+event), і лише потім мережевий виклик. Якби перевірка й запис
// були двома кроками, крон доставки, який бачить ту саму подію щопівгодини,
// слав би людині «посилка прибула» знову й знову — а за кожне таке повідомлення
// ми платимо.
//
// Невдалу відправку клейм не тримає: рядок лишається зі статусом 'failed', а
// наступна спроба його перезапише — щоб тимчасовий збій провайдера не означав
// «покупець не дізнається ніколи».

export type NotifyOutcome = 'sent' | 'duplicate' | 'skipped' | 'failed';

export async function notifyCustomer(input: {
  orderId: string;
  phone: string | null | undefined;
  event: NotifyEvent;
  ctx: NotifyContext;
}): Promise<NotifyOutcome> {
  const db = createServiceClient();

  const phone = normalizePhone(input.phone);
  const body = buildMessage(input.event, input.ctx);
  // Немає номера або немає що сказати — це не помилка, просто нічого не робимо.
  if (!phone || !body) return 'skipped';

  // Клейм. Конфлікт означає, що подію вже відпрацювали — тоді мовчимо.
  const { error: claimErr } = await db.from('customer_notifications').insert({
    order_id: input.orderId,
    event:    input.event,
    phone,
    body,
    status:   'pending',
  });
  if (claimErr) {
    if (claimErr.code === '23505') {
      // Уже є рядок: або надіслано, або впало. Пробуємо ще раз лише те, що впало.
      const { data: prev } = await db
        .from('customer_notifications')
        .select('id, status')
        .eq('order_id', input.orderId).eq('event', input.event)
        .maybeSingle();
      if (!prev || prev.status !== 'failed') return 'duplicate';
    } else {
      alertAdmin('Сповіщення покупцю: не вдалось застовпити відправку', claimErr.message);
      return 'failed';
    }
  }

  const cfg = await getNotifyConfig();
  if (!cfg.enabled) {
    await db.from('customer_notifications')
      .update({ status: 'skipped', error: 'провайдер не налаштований' })
      .eq('order_id', input.orderId).eq('event', input.event);
    return 'skipped';
  }

  const result = await sendMessage(cfg, phone, body);

  await db.from('customer_notifications').update({
    status:              result.ok ? 'sent' : 'failed',
    channel:             result.ok ? result.channel : null,
    provider:            cfg.provider,
    provider_message_id: result.ok ? result.messageId ?? null : null,
    error:               result.ok ? null : result.error,
    sent_at:             result.ok ? new Date().toISOString() : null,
  }).eq('order_id', input.orderId).eq('event', input.event);

  if (!result.ok) {
    alertAdmin(`Сповіщення покупцю не пішло (${input.event})`, `${phone}: ${result.error}`);
    return 'failed';
  }
  return 'sent';
}
