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
