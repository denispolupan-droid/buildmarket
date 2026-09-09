/**
 * Чисті правила рознесення виплат RozetkaPay (під тести; двигун — lib/rozetkapay-allocate).
 * Рознесення виплат RozetkaPay по замовленнях БЕЗ API RozetkaPay (відповідь підтримки
 * 07.09.2026: ключів для проєктів маркетплейсів не дають; статус оплати без затримки
 * передається на Prom/Rozetka — беремо його звідти).
 *
 * Що знаємо про виплату (рядок виписки Mono, lib/rozetkapay-statement): період операцій
 * і брутто. Кандидати — замовлення, чиї гроші йдуть через RozetkaPay (правило дебітора:
 * mp:prom / mp:rozetka), ще не рознесені; дата події:
 *   Prom-оплата            — дата ВРУЧЕННЯ: Prom тримає гроші до вручення й платить наступного дня
 *                            (факт власника + історія 08.09.2026: 20/20 коректних збігів = вручення + 1 день)
 *   Rozetka передоплата    — payment.payment_status.created_at (name = paid)
 *   наложка через Rozetka Delivery (будь-який канал) — дата вручення
 * Дата вручення = carrier_delivered_at (час перевізника: НП RecipientDateTime, Prom
 * unified_status=delivered), а без нього — delivered_at (коли доставку побачив наш крон;
 * відстає до доби, і саме через це виплата 07.09 на 19 801 не підбиралась).
 * Rozetka Pay платить за передоплату наступного дня після оплати (до вручення!), тож
 * невручені Rozetka-замовлення — кандидати; їхній дебітор mp:* іде в мінус (аванс) і обнуляється продажем.
 * Емпірика 07.09 (30 виплат): гроші приходять з лагом до кількох днів, тому вікно
 * [from − LAG, to]; склад підбирається підмножиною рівно на брутто (26/30 зійшлись).
 *
 * Проводка на замовлення: DR customer[mp:rozetkapay] / CR customer[mp:prom|mp:rozetka],
 * ключ rzpay-alloc:{mono_txn}:{order}. Не підібрані виплати лишаються на клірингу
 * mp:rozetkapay сумою і повторно пробуються кожним запуском (вікно обмежене періодом).
 */
import { SALE_DEBTOR, saleDebitPartyFor } from './accounting/sale-party';

export const RZPAY_LAG_DAYS = 6;
const MAX_CANDIDATES = 60;

export type RzPayCandidateOrder = {
  id: string; order_number: number; channel_code: string | null; payment_type: string | null; delivery_type: string | null;
  customer_id?: string | null; status: string; total_price: number; delivered_at: string | null; created_at?: string | null;
  /** Час вручення за даними перевізника — точніший за delivered_at (див. шапку) */
  carrier_delivered_at?: string | null;
  /** Rozetka «безготівковий рахунок» (no_cash): незакритий борг покупця — платять або нам на Mono, або через рахунок Rozetka (RozetkaPay) */
  invoice_open?: number | null;
  prom_payment?: { status?: string; status_modified?: string } | null;
  rz_payment?: { payment_status?: { name?: string; created_at?: string } | null } | null;
};
export type RzPayEvent = { orderId: string; orderNumber: number; party: string; at: string; kind: 'prom_delivered' | 'rz_paid' | 'cod_delivered' | 'rz_invoice'; amount: number };

/** Дата за Києвом (UTC+3 влітку; для дат виплат зсув у годину не критичний — вікно з лагом). */
export function kyivDate(iso: string): string {
  return new Date(new Date(iso).getTime() + 3 * 3600e3).toISOString().slice(0, 10);
}

/** Подія «RozetkaPay має заплатити за це замовлення» або null, якщо замовлення не через RozetkaPay / ще без дати. */
export function rzPayEventFor(o: RzPayCandidateOrder): RzPayEvent | null {
  if (o.status === 'cancelled') return null;
  // Рахунок Rozetka: покупець міг заплатити через Rozetka (тоді гроші прийдуть від RozetkaPay) —
  // кандидат на суму відкритого боргу з дати створення; дебітор — сам покупець
  if (o.channel_code === 'rozetka' && o.payment_type === 'invoice') {
    const open = Math.round(Number(o.invoice_open ?? 0) * 100) / 100;
    if (!(open > 0) || !o.created_at) return null;
    return { orderId: o.id, orderNumber: o.order_number, party: o.customer_id || SALE_DEBTOR.guest, at: kyivDate(o.created_at), kind: 'rz_invoice', amount: open };
  }
  const party = saleDebitPartyFor({ channel_code: o.channel_code, payment_type: o.payment_type, delivery_type: o.delivery_type, customer_id: o.customer_id ?? null });
  if (party !== SALE_DEBTOR.prom && party !== SALE_DEBTOR.rozetka) return null;
  const amount = Math.round(Number(o.total_price) * 100) / 100;
  if (!(amount > 0)) return null;
  const base = { orderId: o.id, orderNumber: o.order_number, party, amount };
  const handedAt = o.carrier_delivered_at ?? o.delivered_at;
  if (o.payment_type === 'prepaid' && o.channel_code === 'prom') {
    // Пром-оплата: гроші виплачують лише після вручення (не в момент оплати покупцем)
    if (o.prom_payment?.status !== 'paid') return null;
    return handedAt ? { ...base, at: kyivDate(handedAt), kind: 'prom_delivered' } : null;
  }
  if (o.payment_type === 'prepaid' && o.channel_code === 'rozetka') {
    const ps = o.rz_payment?.payment_status;
    return ps?.name === 'paid' && ps.created_at ? { ...base, at: ps.created_at.slice(0, 10), kind: 'rz_paid' } : null;
  }
  // Наложка через Rozetka Delivery: RozetkaPay платить після вручення
  return handedAt ? { ...base, at: kyivDate(handedAt), kind: 'cod_delivered' } : null;
}

/**
 * Підмножина кандидатів із сумою рівно gross (у копійках). До 20 кандидатів — повний перебір
 * (найменша підмножина); більше — 0/1-рюкзак по сумі з відновленням складу (кандидати
 * впорядковані найстарішими першими, тож перевага — давнішим подіям). null — не підібрано.
 */
export function matchRzPayPayout<T extends { amount: number }>(gross: number, candidates: T[], max = MAX_CANDIDATES): T[] | null {
  const n = Math.min(candidates.length, max);
  if (n === 0) return null;
  const amounts = candidates.slice(0, n).map(c => Math.round(c.amount * 100));
  const target = Math.round(gross * 100);
  if (!(target > 0)) return null;
  if (n <= 20) {
    let best: number | null = null; let bestBits = 99;
    for (let mask = 1; mask < (1 << n); mask++) {
      let s = 0, bits = 0;
      for (let i = 0; i < n; i++) if (mask & (1 << i)) { s += amounts[i]; bits++; }
      if (s === target && bits < bestBits) { best = mask; bestBits = bits; }
    }
    if (best === null) return null;
    return candidates.slice(0, n).filter((_, i) => best! & (1 << i));
  }
  // dp[s] = (індекс кандидата, яким уперше досягнуто суму s) + 1; 0 — недосяжно
  const dp = new Int16Array(target + 1);
  for (let i = 0; i < n; i++) {
    const a = amounts[i];
    if (!(a > 0) || a > target) continue;
    for (let s = target; s >= a; s--) {
      if (dp[s] === 0 && (s === a || dp[s - a] !== 0)) dp[s] = i + 1;
    }
  }
  if (dp[target] === 0) return null;
  const picked: T[] = [];
  for (let s = target; s > 0;) { const i = dp[s] - 1; picked.push(candidates[i]); s -= amounts[i]; }
  return picked.reverse();
}

export function shiftDate(ymd: string, days: number): string {
  return new Date(Date.parse(ymd) + days * 86400e3).toISOString().slice(0, 10);
}

/** Кандидати для виплати за період: не рознесені, з датою події у вікні, найстаріші першими. */
export function rzPayCandidatesFor(events: RzPayEvent[], periodFrom: string, periodTo: string, allocated: Set<string>, lag = RZPAY_LAG_DAYS): RzPayEvent[] {
  const from = shiftDate(periodFrom, -lag);
  return events
    .filter(e => !allocated.has(e.orderId) && e.at >= from && e.at <= periodTo)
    .sort((a, b) => a.at.localeCompare(b.at) || a.orderNumber - b.orderNumber);
}

