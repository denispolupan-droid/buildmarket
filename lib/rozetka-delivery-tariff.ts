/**
 * lib/rozetka-delivery-tariff.ts — ЧИСТА частина тарифу доставки в точки видачі
 * Rozetka (без серверних імпортів). Серверне читання — lib/rozetka-delivery-fee.ts.
 *
 * Умови Rozetka (з ПДВ), станом на 08.2026:
 *   організація видачі одного відправлення            — 30 грн
 *   те саме, якщо відправляли з відділення Meest ПОШТА — 49 грн
 *   повернення відправлення (покупець відмовився)      — безплатно
 *
 * Списується автоматично з балансу магазину після передачі відправлення
 * перевізникові — і не з основного балансу, а з логістичного
 * (/balance-logistic, операція 34 «Доставка відправлення»). У виписці
 * /balances/search, яку читає звірка комісій, цих списань немає взагалі,
 * тому без цього тарифу вартість доставки не потрапляла в облік ніяк.
 */

export type RozetkaDeliveryTariff = {
  /** Організація видачі одного відправлення, грн з ПДВ. */
  perParcel: number;
  /** Те саме, якщо відправлення здійснене з відділення Meest ПОШТА. */
  perParcelFromMeest: number;
};

export const ROZETKA_DELIVERY_TARIFF_KEY = 'rozetka_delivery_tariff';

export const DEFAULT_ROZETKA_DELIVERY_TARIFF: RozetkaDeliveryTariff = {
  perParcel: 30,
  perParcelFromMeest: 49,
};

/**
 * Збір за відправлення.
 * @param fromMeest — відправляли з відділення Meest ПОШТА (дорожчий тариф).
 * Повернення відмовленого відправлення безплатне, тож окремої гілки не треба:
 * збір нараховується один раз, при передачі перевізникові.
 */
export function computeRozetkaDeliveryFee(
  opts: { fromMeest?: boolean } = {},
  tariff: RozetkaDeliveryTariff = DEFAULT_ROZETKA_DELIVERY_TARIFF,
): number {
  return opts.fromMeest ? tariff.perParcelFromMeest : tariff.perParcel;
}

/**
 * Скільки списати за доставку в точку видачі при відгрузці.
 *
 * Три правила, кожне з живого випадку:
 *
 *  1. Smart-замовлення → 0. Для них Rozetka бере компенсацію Smart ЗАМІСТЬ збору
 *     за видачу, а не додатково: замовлення 902085570 (Smart, 410 грн) має в
 *     накладній delivery_price 18 — це ставка Smart 400–699, а не 30. Збір Smart
 *     проводиться своїм блоком, тож тут повертаємо нуль, інакше буде 18 + 30.
 *  2. Є фактична сума з накладної → беремо її. Rozetka рахує сама, і наша
 *     таблиця тарифів у кращому разі її повторює.
 *  3. Накладної ще немає → тариф (30 грн; 49, якщо з відділення Meest ПОШТА).
 */
export function resolveRozetkaDeliveryFee(
  opts: { isSmart: boolean; actualPrice?: number | null; fromMeest?: boolean },
  tariff: RozetkaDeliveryTariff = DEFAULT_ROZETKA_DELIVERY_TARIFF,
): number {
  if (opts.isSmart) return 0;
  const actual = Number(opts.actualPrice);
  if (Number.isFinite(actual) && actual > 0) return actual;
  return computeRozetkaDeliveryFee({ fromMeest: opts.fromMeest }, tariff);
}

/** Розбір значення з app_settings; на будь-якій невалідності — дефолтний тариф. */
export function parseRozetkaDeliveryTariff(raw: string | null | undefined): RozetkaDeliveryTariff {
  if (!raw) return DEFAULT_ROZETKA_DELIVERY_TARIFF;
  try {
    const p = JSON.parse(raw) as Partial<RozetkaDeliveryTariff>;
    const perParcel = Number(p.perParcel);
    const perParcelFromMeest = Number(p.perParcelFromMeest);
    const ok = (n: number) => Number.isFinite(n) && n >= 0;
    if (!ok(perParcel) || !ok(perParcelFromMeest)) return DEFAULT_ROZETKA_DELIVERY_TARIFF;
    return { perParcel, perParcelFromMeest };
  } catch {
    return DEFAULT_ROZETKA_DELIVERY_TARIFF;
  }
}
