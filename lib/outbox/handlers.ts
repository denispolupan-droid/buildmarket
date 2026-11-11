import { Resend } from 'resend';
import { createServiceClient } from '../supabase-service';
import { getPromOrder, ourStatusToPromStatus, setPromOrderStatus, setPromTTN } from '../prom-api';
import {
  getEpicentrOrder, ourStatusToEpicentrStatus, setEpicentrTTN, advanceEpicentrOrder, cancelEpicentrOrder, epicentrRank,
} from '../epicentr-api';
import { getRozetkaOrderStatusInfo, ourStatusToRozetkaStatus, setRozetkaOrderStatusChained } from '../rozetka-api';
import { sendTelegramResult } from '../telegram';
import { buildCustomerStatusEmail } from '../invoice-email';
import { notifyCustomer } from '../notify/send';
import { carrierInfo } from '../delivery-label';
import type { HandlerResult, NotifyStatusPayload, OutboxRow, PushStatusPayload, PushTtnPayload } from './types';

type Db = ReturnType<typeof createServiceClient>;

/**
 * Обробники outbox. Кожен — ідемпотентний: його можуть викликати двічі (повтор
 * після таймауту). Перед викликом площадки обробник звіряє, що замовлення досі
 * в тому стані, під який писалась подія: інакше skipped, не помилка.
 *
 * Фаза 2 (08.11.2026): пуші статусів/ЕН на площадки й сповіщення покупцю йдуть
 * ЛИШЕ звідси — роути подій не виконують, а записують (архітектурний тест).
 */
export async function runOutboxHandler(db: Db, row: OutboxRow): Promise<HandlerResult> {
  switch (row.handler) {
    case 'mp.push_ttn':           return pushTtn(db, row.aggregate_id, row.payload as PushTtnPayload);
    case 'mp.push_status':        return pushStatus(db, row.aggregate_id, row.payload as PushStatusPayload);
    case 'customer.notify_status': return notifyStatus(db, row.aggregate_id, row.payload as NotifyStatusPayload);
    default: throw new Error(`outbox: невідомий обробник ${row.handler}`);
  }
}

const EPICENTR_AT_OR_PAST_SENT = new Set(['sent', 'received', 'delivered', 'completed', 'closed']);
const epicentrClosed = (code: string) => code.startsWith('canceled') || code.startsWith('closed');

async function pushTtn(db: Db, orderId: string, p: PushTtnPayload): Promise<HandlerResult> {
  const { data: order } = await db.from('orders').select('status, tracking_number').eq('id', orderId).maybeSingle();
  if (!order) return { ok: false, skipped: 'замовлення не знайдено' };
  if (order.status === 'cancelled') return { ok: false, skipped: 'замовлення скасовано' };
  if (order.tracking_number !== p.ttn) return { ok: false, skipped: `ЕН змінилась: ${order.tracking_number ?? '—'}` };

  switch (p.channel) {
    case 'prom': {
      // «Этот ЭН уже добавлен» setPromTTN вважає успіхом (PROM_TTN_ALREADY_SET)
      await setPromTTN(Number(p.external_id), p.ttn, p.delivery_type ?? 'nova_poshta');
      return { ok: true };
    }
    case 'epicentr': {
      const id = String(p.external_id);
      const live = await getEpicentrOrder(id);
      if (!live) return { ok: false, skipped: 'Епіцентр не знає такого замовлення' };
      if (epicentrClosed(live.statusCode)) return { ok: false, skipped: `Епіцентр: ${live.statusCode}` };
      if (EPICENTR_AT_OR_PAST_SENT.has(live.statusCode) && !p.force_ttn) return { ok: true }; // уже відправлене — нічого пушити
      // Повна відвантажка — покроково до «Відправлено» (через «Підтверджено»); часткова
      // чи заміна ЕН — лише номер
      if (p.fully_shipped && !EPICENTR_AT_OR_PAST_SENT.has(live.statusCode)) await advanceEpicentrOrder(id, 'sent', { ttn: p.ttn, live });
      else await setEpicentrTTN(id, p.ttn);
      return { ok: true };
    }
    case 'rozetka': {
      const target = ourStatusToRozetkaStatus(p.status);
      if (!target) return { ok: false, skipped: `немає статусу Rozetka для ${p.status}` };
      let live: { status: number; ttn?: string | null } | null = null;
      try { live = await getRozetkaOrderStatusInfo(Number(p.external_id)); } catch { /* кабінет не відповів — підказка з payload */ }
      // Той самий статус і той самий номер — нічого пушити. Статус збігається, а ЕН у
      // кабінеті інша або порожня (поставили руками) — пушимо, щоб ЕН доїхала (ревю 08.11)
      if (live?.status === target && (live.ttn ?? null) === p.ttn) return { ok: true };
      await setRozetkaOrderStatusChained(Number(p.external_id), target, {
        ttn: p.ttn, currentStatus: live?.status ?? p.cabinet_status, ...(p.force_ttn ? { forceTtn: true } : {}),
      });
      return { ok: true };
    }
    default:
      throw new Error(`outbox mp.push_ttn: невідомий канал ${String((p as { channel?: string }).channel)}`);
  }
}

/**
 * Статус замовлення → площадка. Звірка стану: замовлення має бути досі в статусі
 * payload (скасоване — лишається скасованим назавжди, тож повтор безпечний).
 */
async function pushStatus(db: Db, orderId: string, p: PushStatusPayload): Promise<HandlerResult> {
  const { data: order } = await db.from('orders').select('status, tracking_number').eq('id', orderId).maybeSingle();
  if (!order) return { ok: false, skipped: 'замовлення не знайдено' };
  if (order.status !== p.status) return { ok: false, skipped: `статус уже ${order.status}, подія була для ${p.status}` };
  const ttn = p.ttn ?? order.tracking_number ?? null;

  switch (p.channel) {
    case 'prom': {
      const target = ourStatusToPromStatus(p.status);
      if (!target) return { ok: false, skipped: `немає статусу Prom для ${p.status}` };
      const live = await getPromOrder(Number(p.external_id));
      if (live?.status === target) return { ok: true };
      if (live && live.status === 'canceled' && target !== 'canceled') return { ok: false, skipped: 'у Prom замовлення скасоване' };
      await setPromOrderStatus(Number(p.external_id), target);
      return { ok: true };
    }
    case 'rozetka': {
      // Скасування: статус 13 продавцю недоступний — пушимо причину, обрану менеджером
      const target = p.status === 'cancelled' ? p.cancel_reason : ourStatusToRozetkaStatus(p.status);
      if (!target) return { ok: false, skipped: p.status === 'cancelled' ? 'немає причини скасування Rozetka' : `немає статусу Rozetka для ${p.status}` };
      let live: number | null = null;
      try { live = (await getRozetkaOrderStatusInfo(Number(p.external_id)))?.status ?? null; } catch { /* підказка з payload */ }
      if (live === target) return { ok: true };
      await setRozetkaOrderStatusChained(Number(p.external_id), target, { ...(ttn ? { ttn } : {}), currentStatus: live ?? p.cabinet_status });
      return { ok: true };
    }
    case 'epicentr': {
      const target = ourStatusToEpicentrStatus(p.status);
      if (!target) return { ok: false, skipped: `немає статусу Епіцентру для ${p.status}` };
      const id = String(p.external_id);
      const live = await getEpicentrOrder(id);
      if (!live) return { ok: false, skipped: 'Епіцентр не знає такого замовлення' };
      if (target === 'canceled_by_merchant') {
        if (epicentrClosed(live.statusCode)) return { ok: true };
        // З «Нове» Епіцентр приймає лише canceled — обирає cancelEpicentrOrder
        await cancelEpicentrOrder(id, { reason: 'product_not_available' });
        return { ok: true };
      }
      if (epicentrClosed(live.statusCode)) return { ok: false, skipped: `Епіцентр: ${live.statusCode}` };
      if (target === 'sent') {
        if (EPICENTR_AT_OR_PAST_SENT.has(live.statusCode)) return { ok: true };
        if (!ttn) return { ok: false, skipped: 'без ЕН Епіцентр «Відправлено» не приймає' };
        await advanceEpicentrOrder(id, 'sent', { ttn, live });
        return { ok: true };
      }
      if (target !== 'confirmed_by_merchant' && target !== 'confirmed') return { ok: false, skipped: `статус Епіцентру ${target} не пушимо` };
      if (epicentrRank(live.statusCode) >= epicentrRank(target)) return { ok: true };
      await advanceEpicentrOrder(id, target, { live });
      return { ok: true };
    }
    default:
      throw new Error(`outbox mp.push_status: невідомий канал ${String((p as { channel?: string }).channel)}`);
  }
}

// Ті самі тексти, що слала картка замовлення напряму (lib/telegram.notifyCustomerStatus)
function telegramStatusText(p: NotifyStatusPayload): string | null {
  const c = carrierInfo(p.delivery_type);
  const track = c.trackUrl ? `\nВідстежуйте на ${c.trackUrl.replace(/^https?:\/\//, '')}` : '';
  const messages: Partial<Record<string, string>> = {
    confirmed: `✅ <b>Замовлення №${p.order_number} підтверджено!</b>\nМи підготуємо його до відправки та повідомимо вас.`,
    shipped:   `📦 <b>Замовлення №${p.order_number} відправлено!</b>\n${c.name}, номер: <code>${p.ttn ?? '—'}</code>${track}`,
    delivered: `🎉 <b>Замовлення №${p.order_number} доставлено!</b>\nДякуємо за покупку. Будемо раді бачити вас знову!\nfixline.com.ua`,
    cancelled: `❌ <b>Замовлення №${p.order_number} скасовано.</b>\nЗ питань: info@fixline.com.ua`,
  };
  return messages[p.status] ?? null;
}

/** Сповіщення покупцю одним каналом; помилка каналу — виняток (повтор за backoff). */
async function notifyStatus(db: Db, orderId: string, p: NotifyStatusPayload): Promise<HandlerResult> {
  const { data: order } = await db.from('orders').select('status').eq('id', orderId).maybeSingle();
  if (!order) return { ok: false, skipped: 'замовлення не знайдено' };
  // Статус уже інший — покупець отримає повідомлення про новий; про проміжний мовчимо
  if (order.status !== p.status) return { ok: false, skipped: `статус уже ${order.status}` };

  switch (p.via) {
    case 'telegram': {
      if (!p.telegram_chat_id) return { ok: false, skipped: 'немає telegram_chat_id' };
      const text = telegramStatusText(p);
      if (!text) return { ok: false, skipped: `немає тексту для статусу ${p.status}` };
      const r = await sendTelegramResult(p.telegram_chat_id, text);
      if (r.error) throw new Error(`Telegram: ${r.error}`);
      return { ok: true };
    }
    case 'email': {
      if (!p.email) return { ok: false, skipped: 'немає email' };
      const html = buildCustomerStatusEmail({
        orderNumber: p.order_number, contact: p.contact ?? '', company: p.company ?? '',
        status: p.status, trackingNumber: p.ttn, deliveryType: p.delivery_type,
        siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://fixline.com.ua',
      });
      if (!html) return { ok: false, skipped: `немає листа для статусу ${p.status}` };
      const resend = new Resend(process.env.RESEND_API_KEY);
      const { error } = await resend.emails.send({
        from: 'FIXLINE <noreply@fixline.com.ua>', to: p.email,
        subject: `Замовлення №${p.order_number} — оновлення статусу`,
        html,
      });
      if (error) throw new Error(`Resend: ${error.message}`);
      return { ok: true };
    }
    case 'sms': {
      // Лише «прийнято» (confirmed); дропшип — телефон клієнта партнера, йому від FIXLINE не пишемо.
      // notifyCustomer сам дедуплікує по (order_id, event) у customer_notifications.
      if (p.status !== 'confirmed') return { ok: false, skipped: 'SMS лише для підтвердження' };
      if (p.channel_code === 'dropship') return { ok: false, skipped: 'дропшип — клієнт партнера' };
      const outcome = await notifyCustomer({
        orderId, phone: p.phone, event: 'accepted',
        ctx: { orderNumber: p.order_number, total: p.total_price },
      });
      if (outcome === 'failed') throw new Error('SMS/Viber: провайдер відмовив');
      return { ok: true };
    }
    default:
      throw new Error(`outbox customer.notify_status: невідомий канал ${String((p as { via?: string }).via)}`);
  }
}
