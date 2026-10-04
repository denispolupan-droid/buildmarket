import { carrierInfo } from './delivery-label';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID ?? '';

// Escape user-controlled values before putting them in a parse_mode:'HTML'
// Telegram message — prevents tag injection and malformed-HTML send failures.
export function escTg(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export type TelegramInlineButton = { text: string; callback_data?: string; url?: string };

/**
 * Надіслати повідомлення (HTML). Повертає message_id або null, якщо не вийшло —
 * основний потік (оформлення замовлення, крон) від цього не залежить.
 * replyMarkup — inline-кнопки (чернетки чатів МП: «Надіслати як є»).
 */
export async function sendTelegram(
  chatId: string | number,
  text: string,
  opts?: { replyMarkup?: { inline_keyboard: TelegramInlineButton[][] }; disablePreview?: boolean },
): Promise<number | null> {
  if (!TOKEN || !chatId) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId, text, parse_mode: 'HTML',
        ...(opts?.replyMarkup ? { reply_markup: opts.replyMarkup } : {}),
        ...(opts?.disablePreview ? { link_preview_options: { is_disabled: true } } : {}),
      }),
    });
    const json = await res.json().catch(() => null) as { ok?: boolean; result?: { message_id?: number } } | null;
    return json?.ok ? (json.result?.message_id ?? null) : null;
  } catch (err) {
    // Не валимо основний потік (оформлення замовлення), але й не ковтаємо помилку мовчки.
    console.error('[telegram] sendMessage failed:', err);
    return null;
  }
}

/** Замінити текст уже надісланого повідомлення (і прибрати кнопки, якщо markup не передано). */
export async function editTelegramMessage(
  chatId: string | number, messageId: number, text: string,
  replyMarkup?: { inline_keyboard: TelegramInlineButton[][] },
): Promise<void> {
  if (!TOKEN || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${TOKEN}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML',
        reply_markup: replyMarkup ?? { inline_keyboard: [] },
      }),
    });
  } catch (err) {
    console.error('[telegram] editMessageText failed:', err);
  }
}

/** Відповідь на натискання inline-кнопки — спливашка в Telegram. */
export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  if (!TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, ...(text ? { text } : {}) }),
    });
  } catch (err) {
    console.error('[telegram] answerCallbackQuery failed:', err);
  }
}

export function notifyAdminNewOrder(order: {
  order_number: number;
  contact: string;
  company?: string | null;
  phone: string;
  total_price: number;
  payment_type: string;
  delivery_city_name?: string | null;
}) {
  if (!ADMIN_CHAT_ID) return;
  const company = order.company ? ` (${escTg(order.company)})` : '';
  const city = order.delivery_city_name ? `\n📦 ${escTg(order.delivery_city_name)}` : '';
  const payment = order.payment_type === 'cod' ? 'Накладений платіж'
                : order.payment_type === 'card' ? '💳 Картка — оплачено'
                : 'Безготівковий';
  sendTelegram(
    ADMIN_CHAT_ID,
    `🛒 <b>Нове замовлення №${order.order_number}</b>\n👤 ${escTg(order.contact)}${company}\n📱 ${escTg(order.phone)}\n💰 ${order.total_price} грн (${payment})${city}`,
  );
}

export async function notifyCustomerNewOrder(
  chatId: string,
  order: {
    order_number: number;
    items: Array<{ name: string; brand: string; qty: number; price: number }>;
    total_price: number;
    payment_type: string;
    delivery_city_name?: string | null;
    invoice_url?: string;
  },
) {
  const PAYMENT_UA: Record<string, string> = {
    cod: 'Накладений платіж',
    invoice: 'Безготівковий розрахунок',
  };
  const itemLines = order.items
    .map(i => `▪️ ${escTg(i.brand)} ${escTg(i.name)} × ${i.qty} — ${(i.price * i.qty).toFixed(0)} ₴`)
    .join('\n');
  const city = order.delivery_city_name ? `\n📍 ${order.delivery_city_name}` : '';
  const payment = PAYMENT_UA[order.payment_type] ?? order.payment_type;
  const invoiceLine = order.payment_type === 'invoice' && order.invoice_url
    ? `\n\n📄 <a href="${order.invoice_url}">Переглянути рахунок</a>`
    : '';

  await sendTelegram(
    chatId,
    `✅ <b>Дякуємо за замовлення №${order.order_number}!</b>\n\n${itemLines}\n\n💰 <b>Сума: ${Number(order.total_price).toFixed(0)} ₴</b>\n💳 ${payment}${city}${invoiceLine}\n\nМи повідомимо вас, коли підтвердимо та відправимо замовлення.`,
  );
}

export function notifyCustomerStatus(
  chatId: string,
  orderNumber: number,
  status: string,
  trackingNumber?: string | null,
  deliveryType?: string | null,
) {
  // Перевізника не хардкодимо: назва, посилання на трекінг і місце видачі —
  // з delivery_type (lib/delivery-label). Інакше покупець, який обрав точку
  // видачі ROZETKA, отримує «ТТН Нова Пошта».
  const c = carrierInfo(deliveryType);
  const track = c.trackUrl ? `\nВідстежуйте на ${c.trackUrl.replace(/^https?:\/\//, '')}` : '';
  const messages: Partial<Record<string, string>> = {
    confirmed: `✅ <b>Замовлення №${orderNumber} підтверджено!</b>\nМи підготуємо його до відправки та повідомимо вас.`,
    shipped:   `📦 <b>Замовлення №${orderNumber} відправлено!</b>\n${c.name}, номер: <code>${trackingNumber ?? '—'}</code>${track}`,
    // Не статус замовлення, а подія трекінгу (посилка чекає на отримувача) —
    // шле крон доставки через notifyParcelEvent з дедуплікацією
    arrived:   `📍 <b>Замовлення №${orderNumber} прибуло!</b>\nПосилка чекає ${c.place}. Заберіть її, будь ласка.`,
    delivered: `🎉 <b>Замовлення №${orderNumber} доставлено!</b>\nДякуємо за покупку. Будемо раді бачити вас знову!\nfixline.com.ua`,
    cancelled: `❌ <b>Замовлення №${orderNumber} скасовано.</b>\nЗ питань: info@fixline.com.ua`,
  };
  const text = messages[status];
  if (text) sendTelegram(chatId, text);
}
