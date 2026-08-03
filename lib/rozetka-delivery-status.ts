/**
 * lib/rozetka-delivery-status.ts — де зараз посилка, відправлена в точку видачі Rozetka.
 *
 * Нова Пошта віддає рух посилки окремим API (TrackingDocument). У Rozetka Delivery
 * такого немає: в апідоку розділ Octopus має лише створення/друк накладних, а
 * `/delivery-rozetka/ttn-list` знає рівно три стани («Створено рахунок», «В дорозі»,
 * «Повернення прямує на точку видачі») — там немає ані «Отримано», ані відмови.
 *
 * Зате рух посилки повністю відбивається у СТАТУСІ ЗАМОВЛЕННЯ, і Rozetka сама
 * віддає українську назву в `status_data.title`. Реальна драбина (замовлення
 * 901698980, від створення до відмови):
 *
 *   1 Нове → 26 Обробляється менеджером → 61 Заплановано передачу перевізникові
 *   → 80 Очікує отримання від продавця → 81 Прийнято від продавця
 *   → 3 Передано до служби доставки → 82 Знаходиться в РЦ ⇄ 4 Доставляється
 *   → 5 Очікує в пункті самовивозу → 6 Виконано | 11 Не прийшов | 12 Відмова
 *
 * Тому назву статусу НЕ хардкодимо — беремо з відповіді. Тут лише те, що з назви
 * не виводиться: на якому етапі посилка і що з цього має зробити облік.
 */

/** Замовлення виконано — покупець забрав. Єдиний статус, за яким проводимо продаж. */
export const RZ_STATUS_DELIVERED = 6;

/**
 * Перевізник уже фізично взяв посилку. Аналог «НП зареєструвала рух»:
 * з цього моменту скасування вже не прибирає посилку — вона поїде назад.
 * 61/80 сюди НЕ входять: накладна створена, але відправлення ще в нас.
 */
const RZ_ACCEPTED = new Set([81, 3, 82, 4, 5, 6, 11, 12, 19]);

/** Посилка їде назад: не забрали, відмовились при отриманні, повернено. */
const RZ_RETURNING = new Set([11, 12, 19]);

export type RozetkaDeliveryPhase =
  | 'created'    // накладна є, посилка ще в продавця
  | 'accepted'   // перевізник узяв, посилка в дорозі / чекає в точці
  | 'delivered'  // покупець забрав
  | 'returning'; // їде назад

export function rozetkaDeliveryPhase(status: number | null | undefined): RozetkaDeliveryPhase | null {
  if (status == null || !Number.isFinite(status)) return null;
  if (status === RZ_STATUS_DELIVERED) return 'delivered';
  if (RZ_RETURNING.has(status)) return 'returning';
  if (RZ_ACCEPTED.has(status)) return 'accepted';
  return 'created';
}

/** Чи вважати, що перевізник прийняв відправлення (для carrier_accepted_at). */
export function isRozetkaCarrierAccepted(status: number | null | undefined): boolean {
  const phase = rozetkaDeliveryPhase(status);
  return phase === 'accepted' || phase === 'delivered' || phase === 'returning';
}
