/**
 * lib/rozetka-delivery-tariff.ts — ЧИСТА частина тарифу доставки в точки видачі
 * Rozetka (без серверних імпортів). Серверне читання — lib/rozetka-delivery-fee.ts.
 *
 * Умови Rozetka (з ПДВ), станом на 08.2026:
 *   організація видачі одного відправлення            — 35 грн (до 07.08.2026 — 30)
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
  // 07.08.2026 Rozetka підняла збір з 30 до 35 ₴ і нікого не попередила. Це лише
  // ПЕРВИННА оцінка при відгрузці: факт приходить із логістичного балансу і
  // доводиться до копійки синком (syncRozetkaFees). Але оцінка теж має бути
  // правдивою — на старих 30 ₴ облік місяць занижував витрату.
  perParcel: 35,
  perParcelFromMeest: 49,
};

/**
 * Типи операцій ЛОГІСТИЧНОГО балансу, якими Rozetka бере збір за організацію
 * видачі. Саме списком, а не однією константою: у серпні 2026 площадка мовчки
 * перейшла з 34 на 106 і 107, синк дивився тільки на 34 — і збір перестав
 * потрапляти в облік узагалі. Звірка 31.08 показала 1 333 ₴ у них проти 1 230 ₴
 * у нас, і половина цієї різниці — саме невидимі типи.
 *
 *   34  «Доставка відправлення»                                    (до 05.08.2026)
 *   55  «Організація видачі відправлення з партнерськими службами» (Meest, 49 ₴)
 *   106 «Організація видачі відправлень»
 *   107 «Організація видачі відправлення з партнерськими службами»
 *
 * Типи, що НЕ є збором і сюди не входять: 35/36 коригування рахунку, 42 доставка
 * за рахунок отримувача (0 ₴), 43 зворотна доставка (0 ₴), 68 розподілення
 * гарантійного платежу (це поповнення логістичного рахунку, а не витрата),
 * 73 повернення гарантійного платежу.
 */
export const ROZETKA_PICKUP_OP_TYPES = [34, 55, 106, 107] as const;

/** Списання логістичного балансу, яке треба провести як збір за видачу. */
export function isRozetkaPickupOp(operationType: number): boolean {
  return (ROZETKA_PICKUP_OP_TYPES as readonly number[]).includes(operationType);
}

/**
 * Типи, які ми свідомо НЕ проводимо. Усе, чого немає ні тут, ні в списку зборів,
 * — новий тип: про нього треба дізнатись одразу, а не через місяць розбіжності.
 */
const KNOWN_NON_FEE_OPS = [35, 36, 42, 43, 68, 73] as const;

export function isUnknownLogisticOp(operationType: number): boolean {
  return !isRozetkaPickupOp(operationType)
    && !(KNOWN_NON_FEE_OPS as readonly number[]).includes(operationType);
}

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
