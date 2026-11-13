/**
 * DeliveryProvider (аудит 31.10.2026, п. 17) — контракт перевізника для руху
 * посилок. Синк доставки (lib/delivery/sync.ts) знає лише цей контракт: вибирає
 * замовлення, групує їх за провайдером, питає рух і застосовує відповіді одним
 * конвеєром (текст статусу → «прийнято перевізником» → сповіщення → вручення:
 * проведення РН, витрати продавця, «Доставлено» з подіями outbox).
 *
 * Новий перевізник = один файл у providers/ + рядок у registry.ts; конвеєр,
 * облік і сповіщення не правляться.
 */

/** Рядок orders у вибірці синку — усе, що треба провайдерам і конвеєру. */
export type TrackedOrder = {
  id: string;
  order_number: number;
  status: string;
  tracking_number: string | null;
  carrier_accepted_at: string | null;
  channel_code: string | null;
  partner_code: string | null;
  rozetka_order_id: number | null;
  delivery_type: string | null;
  telegram_chat_id: string | null;
  flags: unknown;
  phone: string | null;
  email: string | null;
  contact: string | null;
  company: string | null;
  total_price: number | null;
  rz_payment_fee: number | null;
  rz_delivery_cost: number | null;
  rz_delivery_payer: string | null;
};

/** Фаза посилки у термінах конвеєра, незалежно від кодів перевізника. */
export type ParcelPhase = 'created' | 'in_transit' | 'arrived' | 'delivered' | 'returning' | 'unknown';

/** Витрата продавця, яку проводимо при врученні (ключ ідемпотентності — по ЕН). */
export type SellerExpense = {
  amount: number;
  creditParty: string;
  docType: string;
  idempotencyKey: string;
  description: string;
};

export type ParcelUpdate = {
  /** Текст статусу перевізника як є (null — не міняти). */
  statusText: string | null;
  phase: ParcelPhase;
  /** Перевізник прийняв посилку (конвеєр ставить carrier_accepted_at, якщо ще порожньо). */
  carrierAccepted: boolean;
  /** Час вручення від перевізника (НП: RecipientDateTime), якщо він його дає. */
  deliveredAt?: string | null;
  /** Додаткові колонки orders від перевізника (вартість/платник НП, трекінг повернення). */
  patch?: Record<string, unknown>;
  /** Витрати продавця, які проводяться лише при врученні. */
  expenses?: SellerExpense[];
  /** Гак провайдера після першого «прийнято» (Rozetka: статус 3 у кабінет). */
  onAccepted?: () => Promise<void>;
};

export type TrackContext = { actor: string };

export interface DeliveryProvider {
  /** Ключ для результату синку й логів. */
  code: 'np' | 'rozetka' | 'rzOwn' | 'meest' | 'manual';
  label: string;
  /** Чи цей провайдер веде замовлення з таким delivery_type. */
  handles(deliveryType: string | null | undefined): boolean;
  /** Чи шлемо покупцю «посилка поїхала / прибула» за фазами цього перевізника. */
  notifiesParcelEvents: boolean;
  /** Пакетний рух: Map<order.id, ParcelUpdate>. Замовлень без відповіді в мапі немає. */
  track(orders: TrackedOrder[], ctx: TrackContext): Promise<Map<string, ParcelUpdate>>;
}
