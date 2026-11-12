// Спосіб оплати, яким платив покупець на маркетплейсі.
//
// Наш `orders.payment_type` знає лише грубий тип (cod / prepaid / card), тож у
// картці замовлення «Оплачено 1 552 ₴» не відповідало на просте питання — чим
// саме. Обидві площадки віддають це в сирому payload, просто в різних місцях:
//   Prom    — payment_option.name («Пром-оплата») + payment_data.type («evopay»)
//   Rozetka — payment.payment_method_name («Оплата під час отримання товару»)

/**
 * Форма оплати одним кодом. Значення рахує БД — generated-колонка
 * orders.payment_method_code (міграція 099): фільтр списку й лічильники чіпів
 * беруть одне й те саме поле, тож розійтися вони не можуть.
 *
 * Тут лише підписи для UI — щоб назва форми оплати була в одному місці.
 */
export type PaymentMethodCode =
  | 'cod' | 'installments' | 'prom' | 'wallet' | 'card' | 'partner' | 'invoice' | 'cash' | 'deferred' | 'other';

// Підписи короткі навмисне: ряд фільтрів у журналі замовлень і без того має
// 15 чіпів, а з повними назвами («Накладений платіж», «Apple / Google Pay») він
// переносився на другий рядок. Повна назва лишається в title при наведенні.
export const PAYMENT_METHOD_LABEL: Record<PaymentMethodCode, string> = {
  cod:      'Накладений',
  installments: 'Частинами',
  prom:     'Пром-оплата',
  wallet:   'Apple/Google',
  card:     'Картка',
  partner:  'Партнер',
  invoice:  'Рахунок',
  cash:     'Готівка',
  deferred: 'Відстрочка',
  other:    'Інше',
};

export const PAYMENT_METHOD_HINT: Record<PaymentMethodCode, string> = {
  cod:      'Оплата при отриманні — гроші приходять після доставки',
  installments: 'Оплата частинами (Rozetka / Prom) — гроші перераховує площадка чи банк',
  prom:     'Пром-оплата (evopay) на площадці Prom',
  wallet:   'Apple Pay або Google Pay через Rozetka',
  card:     'Картка онлайн: Monobank на сайті або Visa/MasterCard у Rozetka',
  partner:  'Дропшип: партнер розраховується з нами по взаєморозрахунках',
  invoice:  'Безготівка: рахунок на сайті/в роздрібі або «Оплата на рахунок продавця» в Rozetka',
  cash:     'Готівка',
  deferred: 'Відстрочка платежу',
  other:    'Форму оплати не вдалося визначити',
};

/** Порядок чіпів у фільтрі — від найчастішого до рідкісного. */
export const PAYMENT_METHOD_ORDER: PaymentMethodCode[] = [
  'cod', 'prom', 'wallet', 'card', 'installments', 'invoice', 'partner', 'cash', 'deferred', 'other',
];

/**
 * Групи для фільтра журналу: менеджеру важливо не «чим саме», а «коли й звідки
 * прийдуть гроші». Вісім чіпів (Пром-оплата / Apple-Google / Картка окремо)
 * роздували ряд фільтрів; точний спосіб видно в рядку (Пром, A Pay, G Pay, Кар.).
 */
export type PaymentGroupKey = 'cod' | 'online' | 'invoice' | 'other';

export const PAYMENT_GROUPS: { key: PaymentGroupKey; label: string; hint: string; codes: PaymentMethodCode[] }[] = [
  { key: 'cod',     label: 'Накладений', codes: ['cod'],
    hint: 'Оплата при отриманні — гроші приходять після доставки (НоваПей / RozetkaPay)' },
  { key: 'online',  label: 'Онлайн',     codes: ['prom', 'wallet', 'card', 'installments'],
    hint: 'Передоплата онлайн: Пром-оплата, Apple/Google Pay, картка, оплата частинами' },
  { key: 'invoice', label: 'Рахунок',    codes: ['invoice', 'deferred', 'partner'],
    hint: 'Безготівка за рахунком, у т.ч. з відстрочкою, і розрахунок із дропшип-партнером' },
  { key: 'other',   label: 'Готівка',    codes: ['cash', 'other'],
    hint: 'Готівка' },
];

/** Група за кодом форми оплати (null/невідомий → «Інше»). */
export function paymentGroupOf(code: string | null | undefined): PaymentGroupKey {
  return PAYMENT_GROUPS.find(g => (g.codes as string[]).includes(code ?? ''))?.key ?? 'other';
}

/** Значення параметра ?pay= → група. Старі посилання з кодом (?pay=prom) теж працюють. */
export function parsePaymentGroup(param: string | null | undefined): PaymentGroupKey | '' {
  if (!param) return '';
  if (PAYMENT_GROUPS.some(g => g.key === param)) return param as PaymentGroupKey;
  if ((PAYMENT_METHOD_ORDER as string[]).includes(param)) return paymentGroupOf(param);
  return '';
}

/** ?pay=cod,online → обрані групи без повторів (мультивибір у журналі, 12.11.2026). */
export function parsePaymentGroups(param: string | null | undefined): PaymentGroupKey[] {
  const keys = new Set((param ?? '').split(',').map(s => parsePaymentGroup(s.trim())).filter(Boolean) as PaymentGroupKey[]);
  return PAYMENT_GROUPS.map(g => g.key).filter(k => keys.has(k));
}

export type PaymentSource = {
  channel_code?: string | null;
  prom_data?: Record<string, unknown> | null;
  rozetka_data?: Record<string, unknown> | null;
  epicentr_data?: Record<string, unknown> | null;
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

// payment_type_title («Готівкова») не показуємо: Rozetka ставить його за
// способом доставки, а не за тим, чим покупець насправді розрахувався —
// у точці видачі так само платять карткою. Назви способу (payment_method_name)
// досить, і вона не бреше.
function rozetkaMethod(rozetkaData: Record<string, unknown>): PaymentMethodInfo | null {
  const payment = rozetkaData.payment as { payment_method_name?: unknown } | null | undefined;
  const label = str(payment?.payment_method_name);
  return label ? { label } : null;
}

// Епіцентр: address.shipment.paymentProvider — код способу оплати з їхнього enum
const EPICENTR_PAYMENT_LABEL: Record<string, string> = {
  pay_on_pickup:     'Оплата при отриманні',
  pay_on_delivery:   'Накладений платіж',
  easypay:           'Онлайн (EasyPay)',
  monobank:          'Онлайн (monobank)',
  invoice:           'Рахунок для юр. осіб',
  prepayment:        'Передоплата',
  credit_pravexbank: 'Кредит (Правекс Банк)',
};

function epicentrMethod(epicentrData: Record<string, unknown>): PaymentMethodInfo | null {
  const address  = epicentrData.address as { shipment?: { paymentProvider?: unknown } } | null | undefined;
  const provider = str(address?.shipment?.paymentProvider);
  if (!provider) return null;
  const label = EPICENTR_PAYMENT_LABEL[provider] ?? provider;
  return epicentrData.payed === true ? { label, detail: 'оплачено' } : { label };
}

/** Спосіб оплати з payload маркетплейсу; null — якщо площадка нічого не дала. */
export function marketplacePaymentMethod(order: PaymentSource): PaymentMethodInfo | null {
  if (order.channel_code === 'prom' && order.prom_data) return promMethod(order.prom_data);
  if (order.channel_code === 'rozetka' && order.rozetka_data) return rozetkaMethod(order.rozetka_data);
  if (order.channel_code === 'epicentr' && order.epicentr_data) return epicentrMethod(order.epicentr_data);
  return null;
}
