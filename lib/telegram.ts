const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID ?? '';

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
  } catch {}
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
  const company = order.company ? ` (${order.company})` : '';
  const city = order.delivery_city_name ? `\n📦 ${order.delivery_city_name}` : '';
  const payment = order.payment_type === 'cod' ? 'Накладений платіж' : 'Безготівковий';
  sendTelegram(
    ADMIN_CHAT_ID,
    `🛒 <b>Нове замовлення №${order.order_number}</b>\n👤 ${order.contact}${company}\n📱 ${order.phone}\n💰 ${order.total_price} грн (${payment})${city}`,
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
    `🔄 <b>Замовлення №${order.order_number}</b> → ${STATUS_UA[newStatus] ?? newStatus}\n👤 ${order.contact} | ${order.phone}`,
  );
}

export function notifyCustomerStatus(
  chatId: string,
  orderNumber: number,
  status: string,
  trackingNumber?: string | null,
) {
  const messages: Partial<Record<string, string>> = {
    confirmed: `✅ <b>Замовлення №${orderNumber} підтверджено!</b>\nМи підготуємо його до відправки та повідомимо вас.`,
    shipped:   `📦 <b>Замовлення №${orderNumber} відправлено!</b>\nТТН Нова Пошта: <code>${trackingNumber ?? '—'}</code>\nВідстежуйте на novaposhta.ua`,
    delivered: `🎉 <b>Замовлення №${orderNumber} доставлено!</b>\nДякуємо за покупку. Будемо раді бачити вас знову!\nfixline.com.ua`,
    cancelled: `❌ <b>Замовлення №${orderNumber} скасовано.</b>\nЗ питань: info@fixline.com.ua`,
  };
  const text = messages[status];
  if (text) sendTelegram(chatId, text);
}
