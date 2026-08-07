import { SITE_URL } from '../site';

// Тексти сповіщень покупцю. Окремо від відправки — щоб їх можна було читати,
// правити й покривати тестами, не заглядаючи в мережевий код.
//
// SMS тарифікується сегментами по 70 символів (кирилиця), тож кожен зайвий
// рядок — це гроші на кожному замовленні. Тримаємо в одному сегменті все, крім
// повідомлення з ТТН, де номер накладної важливіший за економію.

export type NotifyEvent = 'shipped' | 'arrived' | 'pickup_reminder';

export type NotifyContext = {
  orderNumber: number;
  trackingNumber?: string | null;
  carrier?: 'nova' | 'rozetka' | null;
  /** Скільки днів безкоштовного зберігання лишилось (для нагадування) */
  daysLeft?: number | null;
};

const carrierName = (c: NotifyContext['carrier']) =>
  c === 'rozetka' ? 'Rozetka Доставка' : 'Нова Пошта';

export function buildMessage(event: NotifyEvent, ctx: NotifyContext): string | null {
  switch (event) {
    case 'shipped':
      if (!ctx.trackingNumber) return null;   // без номера повідомлення марне
      return `FIXLINE: замовлення №${ctx.orderNumber} відправлено. ${carrierName(ctx.carrier)}, ТТН ${ctx.trackingNumber}`;

    case 'arrived':
      return `FIXLINE: замовлення №${ctx.orderNumber} прибуло у відділення ${carrierName(ctx.carrier)}. Чекаємо вас`;

    case 'pickup_reminder':
      return ctx.daysLeft && ctx.daysLeft > 0
        ? `FIXLINE: посилка №${ctx.orderNumber} чекає у відділенні. Безкоштовне зберігання ще ${ctx.daysLeft} дн.`
        : `FIXLINE: посилка №${ctx.orderNumber} досі чекає у відділенні. Заберіть, будь ласка, або вона поїде назад`;
  }
}

/** Посилання на замовлення — для Viber, де є кнопка; в SMS не вставляємо (довго). */
export function orderUrl(orderId: string): string {
  return `${SITE_URL}/invoice/${orderId}`;
}

/** Скільки сегментів SMS займе текст (кирилиця — 70 символів на сегмент). */
export function smsSegments(text: string): number {
  return Math.max(1, Math.ceil(text.length / 70));
}
