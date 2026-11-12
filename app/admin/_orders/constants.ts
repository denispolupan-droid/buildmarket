import { STATUS_RANK as ORDER_STATUS_RANK } from '../../../lib/orders/status';

export const CHANNEL_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  website:  { label: 'Магазин',  color: 'var(--brand-blue)', bg: '#EFF4FF' },
  b2b:      { label: 'Опт',      color: '#6B21A8', bg: '#FAF5FF' },
  dropship: { label: 'Дроп',     color: '#0E7490', bg: '#ECFEFF' },
  retail:   { label: 'Роздріб',  color: '#B45309', bg: '#FEF3C7' },
  phone:    { label: 'Телефон',  color: 'var(--text-primary)', bg: '#F3F4F6' },
  prom:     { label: 'Prom',     color: '#C2410C', bg: '#FFF7ED' },
  rozetka:  { label: 'Rozetka',  color: '#15803D', bg: '#DCFCE7' },
  // Фірмовий синій Епіцентру, залитий: світлий синій уже в «Магазину»
  epicentr: { label: 'Епіцентр', color: 'var(--epicentr-ink)', bg: 'var(--epicentr)' },
};

// Мітка «той самий покупець» (кандидати на одну ТТН): тони чергуються між
// групами, щоб дві пари поруч у списку не читались як одна.
export const SAME_BUYER_TONES = [
  { c: '#0E7490', bg: '#ECFEFF', b: '#67E8F9' },
  { c: '#BE185D', bg: '#FDF2F8', b: '#F9A8D4' },
  { c: '#4D7C0F', bg: '#F7FEE7', b: '#BEF264' },
  { c: '#9A3412', bg: '#FFF7ED', b: '#FDBA74' },
];

export const STATUSES = [
  { value: 'new',            label: 'Нове',            color: 'var(--brand-blue)', bg: '#EFF4FF' },
  { value: 'pending_payment',label: 'Очікує оплату',   color: '#64748B', bg: '#F1F5F9' },
  { value: 'confirmed',      label: 'Підтверджено',    color: '#15803D', bg: '#DCFCE7' },
  { value: 'awaiting_stock', label: 'Очікуємо товар',  color: '#7C3AED', bg: '#F5F3FF' },
  { value: 'picking',        label: 'Збирається',      color: '#0E7490', bg: '#ECFEFF' },
  { value: 'shipped',        label: 'Відправлено',     color: '#B45309', bg: '#FEF3C7' },
  { value: 'delivered',      label: 'Доставлено',      color: '#15803D', bg: '#DCFCE7' },
  { value: 'cancelled',      label: 'Скасовано',       color: '#DC2626', bg: '#FEE2E2' },
];

// Джерело відвантаження можна переграти, доки замовлення не пішло в збирання:
// після проведення ще лишається час вирішити, чим відвантажувати. Той самий
// перелік перевіряє й API (fulfillment-source) — тут лише щоб не показувати
// активний селект там, де сервер усе одно відмовить.
export const SOURCE_EDITABLE_STATUSES = ['new', 'confirmed', 'awaiting_stock'];

/** Перевізники, яким потрібні місто й відділення (у самовивозу й Харкова їх немає). */
export const DELIVERY_NEEDS_CITY = ['nova', 'rz_delivery', 'rozetka_delivery', 'ukrposhta', 'meest'];

export const DELIVERY_LABEL: Record<string, string> = {
  nova: 'Нова Пошта', nova_poshta: 'Нова Пошта', kharkiv: 'Харків і область', pickup: 'Самовивіз',
  // Приходять з маркетплейсів; накладну поки оформлюють у кабінеті перевізника чи площадки
  ukrposhta: 'Укрпошта', meest: 'Meest', courier: "Кур'єр",
  // Точки видачі Rozetka: накладна оформлюється власним API Rozetka, не НП
  rozetka_delivery: 'Rozetka Доставка',
  // Ті самі фізичні точки, але наш власний договір з rz-delivery (замовлення сайту).
  // Назви навмисно різні: за ними менеджер розуміє, ЯКИМ API робити накладну.
  rz_delivery: 'ROZETKA Доставка (сайт)',
};

export const rowBadge: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', maxWidth: '100%',
  fontSize: '9.5px', fontWeight: 700, lineHeight: '14px', letterSpacing: '.02em',
  border: '1px solid', borderRadius: '5px', padding: '0 5px',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  verticalAlign: 'middle',
};

export const PAYMENT_LABEL: Record<string, string> = {
  invoice: 'Безготівковий', cod: 'Оплата при отриманні', card: 'Картка онлайн',
};

// Розподіл замовлень за перевізником (Rozetka Доставка — власний тип, решта —
// НП, самовивіз ні під що не підпадає) тепер робить сервер: див. applyOrderFilters
// у app/admin/page.tsx. Клієнтська копія була б другою правдою.

// Порядок статусів — з lib/orders/status (те саме джерело, що й у PATCH на сервері).
export const STATUS_RANK = ORDER_STATUS_RANK as Record<string, number>;

/**
 * Мініатюри товарів у згорнутому рядку журналу. Показуємо перші `max` фото, а
 * лічильник на останній плитці каже, скільки позицій у замовленні всього.
 * Некликабельні навмисно: клік по рядку розгортає картку, і промах по мініатюрі
 * не має відкривати сторонню сторінку.
 * `pad` добиває ряд порожніми плитками — щоб на десктопі блок клієнта в усіх
 * рядках починався з тієї самої вертикалі.
 */
// Посилку не забрали, замовлення скасували — а товар десь є. З міграції 103 борг
// перед постачальником уже проведено (він виникає при відвантаженні), тож автоматом
// вирішити не можна: товар або поїхав назад постачальнику, або лишився в нас.
// Компонент сам питає бекенд, чи висить транзит, і мовчить, якщо ні.
export const decisionBtn: React.CSSProperties = {
  height: '28px', padding: '0 10px', borderRadius: '7px', fontSize: '12px', fontWeight: 600,
  cursor: 'pointer', border: '1px solid var(--border)', background: '#fff', color: 'var(--text-primary)',
};
