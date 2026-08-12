import { SITE_URL } from '../site';
import { carrierInfo } from '../delivery-label';

// Тексти сповіщень покупцю. Окремо від відправки — щоб їх можна було читати,
// правити й покривати тестами, не заглядаючи в мережевий код.
//
// SMS тарифікується сегментами по 70 символів (кирилиця), тож кожен зайвий
// рядок — це гроші на кожному замовленні. Тримаємо в одному сегменті все, крім
// повідомлення з ТТН, де номер накладної важливіший за економію.

export type NotifyEvent = 'accepted' | 'shipped' | 'arrived' | 'pickup_reminder';

export type NotifyContext = {
  orderNumber: number;
  /** Сума замовлення — потрібна в підтвердженні, щоб покупець упізнав своє */
  total?: number | null;
  trackingNumber?: string | null;
  carrier?: 'nova' | 'rozetka' | null;
  /** Скільки днів безкоштовного зберігання лишилось (для нагадування) */
  daysLeft?: number | null;
};

// Адреса без протоколу: у SMS «https://» — це 8 символів, які нічого не додають,
// а телефон однаково зробить із домену посилання.
const shortSite = () => SITE_URL.replace(/^https?:\/\//, '').replace(/\/$/, '');

// Назва перевізника — з того самого довідника, що й листи та Telegram
// (lib/delivery-label). Власна копія рядка тут уже призводила до розбіжності:
// у SMS «Rozetka Доставка», у листі «Нова Пошта» на тому самому замовленні.
const carrier = (c: NotifyContext['carrier']) =>
  carrierInfo(c === 'rozetka' ? 'rz_delivery' : 'nova');

export function buildMessage(event: NotifyEvent, ctx: NotifyContext): string | null {
  switch (event) {
    // Перше повідомлення в житті замовлення: підтверджуємо, що взяли в роботу.
    // Сума — щоб людина впізнала своє замовлення серед кількох, посилання —
    // щоб було куди повернутись. Разом виходить два SMS-сегменти, і це свідомо:
    // підтвердження без суми й адреси не виконує своєї роботи.
    case 'accepted': {
      const sum = ctx.total != null ? ` на ${Math.round(ctx.total)} ₴` : '';
      return `FIXLINE: замовлення №${ctx.orderNumber}${sum} прийнято, найближчим часом відправимо. ${shortSite()}`;
    }

    case 'shipped':
      if (!ctx.trackingNumber) return null;   // без номера повідомлення марне
      return `FIXLINE: замовлення №${ctx.orderNumber} відправлено. ${carrier(ctx.carrier).name}, ТТН ${ctx.trackingNumber}`;

    // «у відділення Rozetka Доставка» звучало як помилка: у цього перевізника
    // відділень немає, є точки видачі. Місце бере на себе довідник.
    case 'arrived':
      return `FIXLINE: замовлення №${ctx.orderNumber} чекає ${carrier(ctx.carrier).place}. Заберіть, будь ласка`;

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
