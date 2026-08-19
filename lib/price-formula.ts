/**
 * Ціноутворення від собівартості — одна формула на всю систему.
 *
 * Ціни продажу народжуються в синку постачальника (lib/supplier-sync): вхідна
 * ціна з прайса → наценка (товар > бренд > постачальник) → округлення. Ручна
 * переоцінка в розділі «Ціни» рахує те саме, і поки формула жила у двох місцях,
 * екран показував одну цифру, а після наступного синку в базі опинялась інша.
 *
 * Округлення різне навмисно: роздріб — вниз до цілої гривні (цінник без копійок),
 * опт і дроп — до 0.5 (там рахують партіями, півгривні має вагу).
 */

export type PriceKind = 'retail' | 'wholesale' | 'drop';

/** Роздріб — вниз до цілого. 107.9 → 107 */
export function roundRetail(v: number): number {
  return Math.floor(v);
}

/** Опт і дроп — до найближчих 0.5. 97.3 → 97.5 */
export function roundHalf(v: number): number {
  return Math.round(v * 2) / 2;
}

export function roundFor(kind: PriceKind, v: number): number {
  return kind === 'retail' ? roundRetail(v) : roundHalf(v);
}

/** Ціна за наценкою у відсотках від собівартості. */
export function priceFromMarkup(cost: number, markupPct: number, kind: PriceKind): number {
  return roundFor(kind, cost * (1 + markupPct / 100));
}

/**
 * Зворотна дія: яку наценку треба записати в товар, щоб синк отримав саме цю
 * ціну. Без собівартості наценка не має сенсу — повертаємо null, і такий товар
 * лишається з прямо записаною ціною.
 */
export function markupFromPrice(cost: number | null | undefined, price: number | null | undefined): number | null {
  const c = Number(cost ?? 0);
  const p = Number(price ?? 0);
  if (!(c > 0) || !(p > 0)) return null;
  // Два знаки — стільки ж, скільки тримає колонка markup_* (NUMERIC(5,2)).
  // Округляємо ВГОРУ: роздріб потім ріжеться вниз до цілого, і наценка, урізана
  // в останньому знаку, давала ціну на гривню меншу за ту, що бачив менеджер
  // у прев'ю (95.50 × 12.04 % = 106.99 → 106 замість 107).
  // 1e-6 гасить хвіст подвійної точності: 112/100-1 дає 0.12000000000000002,
  // і без цього рівна наценка 12 % перетворювалась на 12.01 %.
  return Math.ceil((p / c - 1) * 10000 - 1e-6) / 100;
}

/** Роздріб ніколи не нижчий за опт — інакше опт вигідніше купувати вроздріб. */
export function retailNotBelowWholesale(retail: number, wholesale: number): number {
  return Math.max(retail, wholesale);
}
