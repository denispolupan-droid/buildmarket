import { carrierInfo } from './delivery-label';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID ?? '';

// Escape user-controlled values before putting them in a parse_mode:'HTML'
// Telegram message — prevents tag injection and malformed-HTML send failures.
function escTg(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const STATUS_UA: Record<string, string> = {
  new: 'Нове',
  confirmed: 'Підтверджено',
  shipped: 'Відправлено',
  delivered: 'Доставлено',
  cancelled: 'Скасовано',
};

export async function sendTelegram(chatId: string | number, text: string): Promise<void> {
  if (!TOKEN || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
  } catch (err) {
    // Не валимо основний потік (оформлення замовлення), але й не ковтаємо помилку мовчки.
    console.error('[telegram] sendMessage failed:', err);
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

export function notifyAdminStatusChange(order: {
  order_number: number;
  contact: string;
  phone: string;
}, newStatus: string) {
  if (!ADMIN_CHAT_ID) return;
  sendTelegram(
    ADMIN_CHAT_ID,
    `🔄 <b>Замовлення №${order.order_number}</b> → ${STATUS_UA[newStatus] ?? newStatus}\n👤 ${escTg(order.contact)} | ${escTg(order.phone)}`,
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
    delivered: `🎉 <b>Замовлення №${orderNumber} доставлено!</b>\nДякуємо за покупку. Будемо раді бачити вас знову!\nfixline.com.ua`,
    cancelled: `❌ <b>Замовлення №${orderNumber} скасовано.</b>\nЗ питань: info@fixline.com.ua`,
  };
  const text = messages[status];
  if (text) sendTelegram(chatId, text);
}
