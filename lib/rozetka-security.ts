/**
 * Історія гарантійного платежу Rozetka (кабінет → «Баланс» → гарантійний платіж →
 * вивантаження *_balance_security_transaction_history.xlsx). ЧИСТІ функції — без
 * серверних імпортів, файл розбирається в браузері.
 *
 * Це єдине місце, де Smart-збір видно ПОСТРОЧНО: «Розподілення гарантійного платежу
 * (Smart)». У /balances/search, у вивантаженні історії транзакцій і в акті його
 * немає — тому до 29.10.2026 ці гроші ловились лише залишком як «невидимі списання».
 * API для цієї історії немає (перевірено 29.10.2026: /balance-security/* → not_found).
 */

export type SecurityRow = { id: number; ts: string; type: string; debit: number; credit: number };

const num = (v: unknown) => Number(String(v ?? '0').replace(/\s/g, '').replace(',', '.')) || 0;

/** Рядки аркуша (header: 1) → операції. Кидає, якщо це не той файл. */
export function parseSecurityRows(sheet: unknown[][]): SecurityRow[] {
  const head = (sheet[0] ?? []).map(c => String(c ?? '').trim().toLowerCase());
  const col = (re: RegExp) => head.findIndex(h => re.test(h));
  const iId = col(/^id$/), iTs = col(/дата/), iType = col(/тип/), iDebit = col(/списано/), iCredit = col(/нараховано/);
  if ([iId, iTs, iType, iDebit, iCredit].some(i => i < 0)) {
    throw new Error('Це не історія гарантійного платежу: потрібні колонки ID, «Дата транзакції», «Тип транзакції», «Списано», «Нараховано»');
  }
  return sheet.slice(1)
    .filter(r => r && String(r[iId] ?? '').trim() !== '')
    .map(r => ({
      id: Number(r[iId]),
      ts: String(r[iTs] ?? '').trim(),
      type: String(r[iType] ?? '').trim(),
      debit: Math.abs(num(r[iDebit])),
      credit: num(r[iCredit]),
    }));
}

export const isSmartRow = (r: SecurityRow) => /\(smart\)/i.test(r.type);

export type SmartCompare = {
  theirTotal: number;
  oursTotal: number;
  /** + Rozetka зняла більше, ніж проведено в нас */
  delta: number;
  from: string | null;
  to: string | null;
  count: number;
  /** Списання, що не складаються з тарифів на замовлення — Smart без прив'язки до замовлення */
  unattributed: { id: number; ts: string; amount: number }[];
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/** Найбільший спільний дільник тарифів у копійках (12/18/30 → 600). */
export function smartFeeStep(fees: number[]): number {
  return fees.map(f => Math.round(f * 100)).filter(f => f > 0).reduce(gcd, 0);
}

/**
 * Smart за файлом проти нашого обліку за ВСЮ історію файлу. Наші суми — усі
 * Smart-проводки marketplace_fee:rozetka (з замовленнями і без), разом зі старими
 * «списаннями без розшифровки» 30.09/23.10, які виявились тим самим Smart.
 *
 * Rozetka списує Smart пачкою за кілька замовлень (36 = 18 + 18), тож «більше за
 * тариф» ще нічого не значить. Ознака «без замовлення» — сума, яку не скласти з
 * тарифів: усі вони кратні step (12/18/30 → 6 ₴), а 260 і 165 ₴ — ні.
 */
export function compareSmart(rows: SecurityRow[], oursTotal: number, fees: number[]): SmartCompare {
  const step = smartFeeStep(fees);
  const smart = rows.filter(isSmartRow);
  const theirTotal = r2(smart.reduce((s, r) => s + r.debit - r.credit, 0));
  const dates = smart.map(r => r.ts.slice(0, 10)).sort();
  return {
    theirTotal,
    oursTotal: r2(oursTotal),
    delta: r2(theirTotal - oursTotal),
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
    count: smart.length,
    unattributed: smart.filter(r => step > 0 && Math.round(r.debit * 100) % step !== 0)
      .map(r => ({ id: r.id, ts: r.ts, amount: r2(r.debit) })),
  };
}
