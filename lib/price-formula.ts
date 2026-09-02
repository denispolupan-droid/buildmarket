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

/** Округлення ВГОРУ за правилом свого тарифу: роздріб — до гривні, опт і дроп — до 0.5. */
export function roundUpFor(kind: PriceKind, v: number): number {
  return kind === 'retail' ? Math.ceil(v) : Math.ceil(v * 2) / 2;
}

export type PriceLadder = { retail: number; wholesale: number; drop: number };

/**
 * Сходинка цін: собівартість ≤ опт і дроп ≤ роздріб.
 *
 * На дешевих позиціях наценку зжирало саме округлення, і сходинка ламалась.
 * Дюбель Masterplast 1701-010 (вхід 1.20 ₴): роздріб = floor(1.2 × 1.2) = 1.00,
 * а дроп = round₀.₅(1.2 × 1.25) = 1.50 — тобто дропшипер купував у нас ДОРОЖЧЕ
 * за роздрібний цінник на сайті, а опт (1.00) ішов нижче собівартості. У серпні
 * 2026 таких позицій було сім, усі — копійчана дрібнота, і всі сім лежали в
 * дропшип-фіді, який партнер вантажить до себе в магазин.
 *
 * Тому кожну ціну продажу піднімаємо щонайменше до собівартості (кроком 0.5,
 * спільним для опту й дропу), а роздріб — не нижче за них обидві. На дешевому
 * товарі роздріб тоді може вийти з половиною гривні замість цілої: краще цінник
 * 1.50, ніж продаж у мінус.
 */
export function enforcePriceLadder(cost: number, p: PriceLadder): PriceLadder {
  const floorAt   = roundUpFor('drop', Math.max(Number(cost) || 0, 0));
  const wholesale = Math.max(p.wholesale, floorAt);
  const drop      = Math.max(p.drop,      floorAt);
  return { wholesale, drop, retail: Math.max(p.retail, wholesale, drop) };
}
