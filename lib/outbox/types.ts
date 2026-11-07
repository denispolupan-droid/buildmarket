/**
 * Outbox подій замовлення (docs/OUTBOX-PLAN.md). Подія = намір побічного ефекту,
 * записаний у тій самій транзакції, що й зміна замовлення; доставляє крон
 * outbox-sweep через обробник за назвою `handler`.
 */
export type OutboxEventName = 'order.shipped' | 'order.confirmed' | 'order.status_changed' | 'order.cancelled' | 'order.created' | 'order.ttn_replaced';

export type OutboxHandler = 'mp.push_ttn' | 'mp.push_status' | 'customer.notify_status';

export type MarketplaceChannel = 'prom' | 'rozetka' | 'epicentr';

/** Знімок для mp.push_ttn: усе, що треба обробнику, без перечитування замовлення. */
export type PushTtnPayload = {
  channel: MarketplaceChannel;
  external_id: string | number;
  order_number: number;
  ttn: string;
  delivery_type: string | null;
  /** Наш цільовий статус після відгрузки: shipped або delivered (самовивіз). */
  status: 'shipped' | 'delivered';
  /** Повна відгрузка — Епіцентру ще й «sent»; часткова — лише номер. */
  fully_shipped: boolean;
  /** Останній відомий статус кабінету Rozetka (підказка для драбини статусів). */
  cabinet_status: number | null;
  /** Заміна ЕН при тому самому статусі: Rozetka PUT з тим самим статусом номер не міняє — потрібен forceTtn. */
  force_ttn?: boolean;
};

/** Знімок для mp.push_status: статус замовлення → статус площадки (підтвердження, зміна статусу, скасування). */
export type PushStatusPayload = {
  channel: MarketplaceChannel;
  external_id: string | number;
  order_number: number;
  /** Наш статус, під який писалась подія; обробник звіряє його з поточним. */
  status: string;
  ttn: string | null;
  /** Rozetka: id причини скасування (статус групи 3), обрана менеджером; без неї скасування не пушиться. */
  cancel_reason: number | null;
  cabinet_status: number | null;
};

/** Знімок для customer.notify_status — по одному рядку на канал, щоб повтор не дублював уже доставлене. */
export type NotifyStatusPayload = {
  via: 'telegram' | 'email' | 'sms';
  order_number: number;
  status: string;
  ttn: string | null;
  delivery_type: string | null;
  telegram_chat_id: string | null;
  email: string | null;
  phone: string | null;
  contact: string | null;
  company: string | null;
  channel_code: string | null;
  total_price: number;
};

export type OutboxPayload = PushTtnPayload | PushStatusPayload | NotifyStatusPayload;

export type OutboxEventInput = {
  event: OutboxEventName;
  handler: OutboxHandler;
  payload: OutboxPayload;
  dedupe_key: string;
};

export type OutboxRow = {
  id: number;
  aggregate: string;
  aggregate_id: string;
  event: string;
  handler: string;
  payload: unknown;
  dedupe_key: string;
  status: 'pending' | 'done' | 'failed' | 'skipped';
  attempts: number;
  next_at: string;
  locked_until: string | null;
  last_error: string | null;
  created_at: string;
  done_at: string | null;
};

export type HandlerResult = { ok: true } | { ok: false; skipped: string };
