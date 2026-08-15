// Спосіб оплати, яким платив покупець на маркетплейсі.
//
// Наш `orders.payment_type` знає лише грубий тип (cod / prepaid / card), тож у
// картці замовлення «Оплачено 1 552 ₴» не відповідало на просте питання — чим
// саме. Обидві площадки віддають це в сирому payload, просто в різних місцях:
//   Prom    — payment_option.name («Пром-оплата») + payment_data.type («evopay»)
//   Rozetka — payment.payment_method_name («Оплата під час отримання товару»)
//             + payment.payment_type_title («Готівкова»)

/**
 * Форма оплати одним кодом. Значення рахує БД — generated-колонка
 * orders.payment_method_code (міграція 099): фільтр списку й лічильники чіпів
 * беруть одне й те саме поле, тож розійтися вони не можуть.
 *
 * Тут лише підписи для UI — щоб назва форми оплати була в одному місці.
 */
export type PaymentMethodCode =
  | 'cod' | 'prom' | 'wallet' | 'card' | 'invoice' | 'cash' | 'deferred' | 'other';

// Підписи короткі навмисне: ряд фільтрів у журналі замовлень і без того має
// 15 чіпів, а з повними назвами («Накладений платіж», «Apple / Google Pay») він
// переносився на другий рядок. Повна назва лишається в title при наведенні.
export const PAYMENT_METHOD_LABEL: Record<PaymentMethodCode, string> = {
  cod:      'Накладений',
  prom:     'Пром-оплата',
  wallet:   'Apple/Google',
  card:     'Картка',
  invoice:  'Рахунок',
  cash:     'Готівка',
  deferred: 'Відстрочка',
  other:    'Інше',
};

export const PAYMENT_METHOD_HINT: Record<PaymentMethodCode, string> = {
  cod:      'Оплата при отриманні — гроші приходять після доставки',
  prom:     'Пром-оплата (evopay) на площадці Prom',
  wallet:   'Apple Pay або Google Pay через Rozetka',
  card:     'Картка онлайн: Monobank на сайті або Visa/MasterCard у Rozetka',
  invoice:  'Безготівка: рахунок на сайті/в роздрібі або «Оплата на рахунок продавця» в Rozetka',
  cash:     'Готівка',
  deferred: 'Відстрочка платежу',
  other:    'Форму оплати не вдалося визначити',
};

/** Порядок чіпів у фільтрі — від найчастішого до рідкісного. */
export const PAYMENT_METHOD_ORDER: PaymentMethodCode[] = [
  'cod', 'prom', 'wallet', 'card', 'invoice', 'cash', 'deferred', 'other',
];

export type PaymentSource = {
  channel_code?: string | null;
  prom_data?: Record<string, unknown> | null;
  rozetka_data?: Record<string, unknown> | null;
};

export type PaymentMethodInfo = {
  /** Основна назва способу оплати, як її називає сама площадка */
  label: string;
  /** Уточнення (спосіб проведення, тип оплати) — коли додає щось понад label */
  detail?: string;
  /** ISO-мітка підтвердження оплати, якщо площадка її дала */
  paidAt?: string;
};

// Технічні коди Prom → людські назви. Незнайомий код показуємо як є: краще
// сирий «monopay», ніж мовчання.
const PROM_TYPE_LABEL: Record<string, string> = {
  evopay:     'Пром-оплата',
  apple_pay:  'Apple Pay',
  applepay:   'Apple Pay',
  google_pay: 'Google Pay',
  googlepay:  'Google Pay',
  privat24:   'Приват24',
  card:       'Картка онлайн',
  cash:       'Готівка',
  cod:        'Накладений платіж',
};

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

function promMethod(promData: Record<string, unknown>): PaymentMethodInfo | null {
  const option = promData.payment_option as { name?: unknown } | null | undefined;
  const data   = promData.payment_data as { type?: unknown; status?: unknown; status_modified?: unknown } | null | undefined;

  const optionName = str(option?.name);
  const rawType    = str(data?.type).toLowerCase();
  const typeLabel  = rawType ? (PROM_TYPE_LABEL[rawType] ?? rawType) : '';

  const label = optionName || typeLabel;
  if (!label) return null;

  // «Пром-оплата · Пром-оплата» — шум; уточнення лишаємо, лише коли воно інше
  const detail = typeLabel && typeLabel.toLowerCase() !== label.toLowerCase() ? typeLabel : undefined;
  const paidAt = str(data?.status).toLowerCase() === 'paid' ? str(data?.status_modified) || undefined : undefined;

  return { label, ...(detail ? { detail } : {}), ...(paidAt ? { paidAt } : {}) };
}

function rozetkaMethod(rozetkaData: Record<string, unknown>): PaymentMethodInfo | null {
  const payment = rozetkaData.payment as { payment_method_name?: unknown; payment_type_title?: unknown } | null | undefined;
  const label  = str(payment?.payment_method_name);
  const detail = str(payment?.payment_type_title);
  if (!label) return detail ? { label: detail } : null;
  return detail && detail.toLowerCase() !== label.toLowerCase() ? { label, detail } : { label };
}

/** Спосіб оплати з payload маркетплейсу; null — якщо площадка нічого не дала. */
export function marketplacePaymentMethod(order: PaymentSource): PaymentMethodInfo | null {
  if (order.channel_code === 'prom' && order.prom_data) return promMethod(order.prom_data);
  if (order.channel_code === 'rozetka' && order.rozetka_data) return rozetkaMethod(order.rozetka_data);
  return null;
}
