/**
 * lib/prom-statement.ts — розбір виписки балансу Prom. Чистий модуль без мережі.
 *
 * У Prom немає API для балансу: /balance/list, /payments/list, /finance/list —
 * усі 404, працюють лише замовлення. Тож єдине джерело «їхнього» боку — історія
 * транзакцій з кабінету, яку продавець копіює як текст (Дата · Сума · Примітка ·
 * Тип, розділені табами або переносами рядків).
 *
 * Тип операції з колонки «Тип» не достатньо: і комісія, і збір за доставку —
 * обидва «Списание». Що це насправді, каже ПРИМІТКА:
 *   «Оплата за доступ к онлайн Каталогу ProSale … по заказу N»  → комісія
 *   «Возврат оплаты за доступ …»                                → сторно комісії
 *   «Компенсация стоимости услуги по организации перевозки …»   → «дешева доставка»
 *   «Prom микс», «Пополнение Баланса»                           → поповнення/пакети
 *
 * Суми в кабінеті — з комою й нерозривними пробілами («-3 487,18 ₴»), тому
 * парсимо їх обережно: звичайний parseFloat на такому рядку дає -3.
 */

export type PromStatementKind = 'commission' | 'commission_refund' | 'np_delivery' | 'topup' | 'package' | 'other';

export type PromStatementRow = {
  date: string;              // YYYY-MM-DD
  amount: number;            // + надходження, − списання (як у кабінеті)
  note: string;
  type: string;
  kind: PromStatementKind;
  promOrderId: number | null;
};

/** «-3 487,18 ₴» → -3487.18. Нерозривні пробіли й кома — звичайні для кабінету. */
export function parsePromAmount(raw: string): number {
  const cleaned = String(raw)
    .replace(/ | |\s/g, '')   // звичайні й нерозривні пробіли
    .replace(/₴|грн\.?/gi, '')
    .replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

/** «04.08.2026» → «2026-08-04». Інші формати повертаємо як є. */
export function parsePromDate(raw: string): string {
  const m = String(raw).trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(raw).trim();
}

export function classifyPromNote(note: string): { kind: PromStatementKind; promOrderId: number | null } {
  const n = String(note);
  const idMatch = n.match(/(?:заказ[уі]?|замовлен\w*)\s*№?\s*(\d{6,})/i);
  const promOrderId = idMatch ? Number(idMatch[1]) : null;

  if (/возврат оплаты за доступ|повернення оплати за доступ/i.test(n)) return { kind: 'commission_refund', promOrderId };
  if (/доступ к онлайн каталогу|доступ до онлайн каталогу|prosale/i.test(n)) return { kind: 'commission', promOrderId };
  if (/организации перевозки|організації перевезення/i.test(n)) return { kind: 'np_delivery', promOrderId };
  if (/prom микс|prom мікс|бонусн/i.test(n)) return { kind: 'package', promOrderId };
  if (/пополнение|поповнення/i.test(n)) return { kind: 'topup', promOrderId };
  return { kind: 'other', promOrderId };
}

const DATE_RE = /^\d{2}\.\d{2}\.\d{4}$/;
const AMOUNT_RE = /^[+-]?[\d\s  ]+(?:[.,]\d{1,2})?\s*₴?$/;

/**
 * Розбір скопійованої таблиці. Формат буфера непередбачуваний: копіювання з
 * кабінету дає то таби, то по одному полю на рядок — тому йдемо потоком токенів
 * і збираємо запис від дати до типу, а не розраховуємо на фіксовані колонки.
 */
export function parsePromStatement(text: string): PromStatementRow[] {
  const tokens = String(text)
    .split(/[\t\r\n]+/)
    .map(s => s.trim())
    .filter(Boolean);

  const rows: PromStatementRow[] = [];
  let i = 0;
  while (i < tokens.length) {
    if (!DATE_RE.test(tokens[i])) { i++; continue; }
    const date = parsePromDate(tokens[i]);
    const amountTok = tokens[i + 1];
    if (!amountTok || !AMOUNT_RE.test(amountTok)) { i++; continue; }
    const amount = parsePromAmount(amountTok);
    if (!Number.isFinite(amount)) { i++; continue; }

    // Далі — примітка (може бути з кількох токенів) і, останнім, тип операції.
    const noteParts: string[] = [];
    let j = i + 2;
    while (j < tokens.length && !DATE_RE.test(tokens[j])) { noteParts.push(tokens[j]); j++; }
    // Останній токен блоку — колонка «Тип», якщо він схожий на тип, а не на текст.
    let type = '';
    if (noteParts.length > 1 && /^(списание|списання|пополнение|поповнення|бонус|отмена списания|скасування списання)$/i.test(noteParts[noteParts.length - 1])) {
      type = noteParts.pop()!;
    }
    const note = noteParts.join(' ');
    const { kind, promOrderId } = classifyPromNote(note);
    rows.push({ date, amount, note, type, kind, promOrderId });
    i = j;
  }
  return rows;
}

/** Підсумки по статтях. Витрати повертаємо ДОДАТНИМИ — як у нашому обліку. */
export function summarizePromStatement(rows: PromStatementRow[]): {
  commission: number; npDelivery: number; topup: number; packages: number; other: number;
} {
  let commission = 0, npDelivery = 0, topup = 0, packages = 0, other = 0;
  for (const r of rows) {
    switch (r.kind) {
      case 'commission':        commission += -r.amount; break;   // списання → витрата
      case 'commission_refund': commission += -r.amount; break;   // повернення зменшує витрату
      case 'np_delivery':       npDelivery += -r.amount; break;
      case 'topup':             topup      += r.amount;  break;
      case 'package':           packages   += r.amount;  break;
      default:                  other      += r.amount;  break;
    }
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { commission: r2(commission), npDelivery: r2(npDelivery), topup: r2(topup), packages: r2(packages), other: r2(other) };
}
