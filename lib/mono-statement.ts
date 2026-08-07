// Чиста логіка розбору виписки Monobank (Personal/ФОП API) для автозарахування
// оплат за рахунками. Гроші — тому винесено в чисту функцію під тести.
//
// Ключове: для вхідних переказів на рахунок ФОП «призначення платежу» приходить
// у полі `comment` (напр. «...згідно рахунку №26071021 від 21 липня 2026р.»),
// а `description` містить лише «Від: <платник>». Тому номер шукаємо насамперед
// у comment, з фолбеком на description.

export type MonoStatementItem = {
  id: string;
  time: number;                // Unix seconds
  amount: number;              // копійки; >0 — надходження, <0 — списання
  description?: string;
  comment?: string;
  counterName?: string;
  counterEdrpou?: string;
  counterIban?: string;
};

// Номери замовлень у системі — цілі числа (напр. 26071021). Витягуємо число
// після «№», «рахунок/рахунку», «замовлення» або просто ізольоване довге число.
// Мінімум 5 цифр — щоб не чіплятися за «2026р.», суми тощо.
const ORDER_NUM_RE = /(?:№|рахунк\w*|замовленн\w*|заказ\w*)\D{0,4}(\d{5,})/i;
const BARE_NUM_RE  = /(?<!\d)(\d{7,})(?!\d)/;   // запасний варіант: довге ізольоване число

export function extractOrderNumber(comment?: string | null, description?: string | null): number | null {
  for (const src of [comment, description]) {
    if (!src) continue;
    const m = src.match(ORDER_NUM_RE);
    if (m) return parseInt(m[1], 10);
  }
  // Фолбек: у comment інколи лише голий номер
  if (comment) {
    const b = comment.match(BARE_NUM_RE);
    if (b) return parseInt(b[1], 10);
  }
  return null;
}

// ── Еквайринг: покриття за карткові оплати на сайті ──────────────────────────
//
// Такий платіж приходить не від покупця, а від банку — одним рядком за день, і
// номера замовлення в ньому немає. Але сам факт покриття означає, що на сайті
// хтось оплатив карткою, тобто замовлення МУСИТЬ існувати. Якщо його немає —
// гроші взяті, а замовлення загубилось (кейс 04.08.2026, 104 ₴).
const ACQUIRING_RE = /еквайринг/i;
// «…Загалом 104 грн. Комісія банку 1.35 грн» — на рахунок падає сума за вирахуванням
// комісії, а звіряти треба з тим, що заплатив покупець.
const ACQUIRING_GROSS_RE = /загалом\s+([\d\s]+(?:[.,]\d+)?)\s*грн/i;

export function isAcquiringSettlement(item: MonoStatementItem): boolean {
  return ACQUIRING_RE.test(`${item.comment ?? ''} ${item.description ?? ''}`);
}

/** Сума, яку заплатив покупець (до комісії банку); null — якщо в тексті її немає. */
export function extractAcquiringGross(comment?: string | null): number | null {
  const m = (comment ?? '').match(ACQUIRING_GROSS_RE);
  if (!m) return null;
  const value = parseFloat(m[1].replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

export type MonoMatch =
  | { kind: 'order'; orderNumber: number; amount: number }   // знайдено №заказу → авто
  | { kind: 'unmatched'; amount: number };                   // на ручну сверку

// Класифікація вхідної транзакції. Лише надходження (amount>0) розглядаються.
export function classifyMonoTxn(item: MonoStatementItem): MonoMatch | null {
  if (!(item.amount > 0)) return null;                 // списання/нуль — ігноруємо
  const amount = Math.round(item.amount) / 100;        // грн
  const orderNumber = extractOrderNumber(item.comment, item.description);
  if (orderNumber) return { kind: 'order', orderNumber, amount };
  return { kind: 'unmatched', amount };
}
