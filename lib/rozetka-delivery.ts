/**
 * «ROZETKA Delivery» — доставка у власні точки видачі Rozetka (в апідоку розділ
 * Octopus). Чистий модуль без мережі й ключів: його читає і серверний маппер
 * замовлень, і клієнтська адмінка.
 *
 * Чим відрізняється від Нової Пошти і чому це не дрібниця:
 *
 *  1. Накладна створюється НЕ в Новій Пошті, а через власний API Rozetka
 *     (POST /delivery-rozetka/create-order-ttn). Номер має вигляд «RMP-161376878».
 *     Спроба оформити на таке замовлення накладну НП дала б посилку, яку точка
 *     видачі не прийме.
 *  2. Доставку Rozetka списує з ОКРЕМОГО логістичного балансу
 *     (/balance-logistic, операція 34 «Доставка відправлення»), а не з основного,
 *     де комісії. У виписці /balances/search цих списань немає взагалі.
 *  3. Поле place_number тут — не номер відділення, а орієнтир («(ЖК Ok'Land)»).
 *     Стара збірка адреси клеїла до нього «Відділення №» і виходило
 *     «Відділення № (ЖК Ok'Land)».
 *
 * Ознаку беремо з delivery_service_id: він числовий і стабільний, на відміну від
 * delivery_service_name, яке Rozetka може переписати. 1 — ROZETKA Delivery,
 * 5 — Нова Пошта, 4 — Meest.
 */

export const ROZETKA_DELIVERY_SERVICE_ID = 1;

/** Наш delivery_type для таких замовлень. Свій, а не 'courier': на 'courier' зав'язана логіка НП. */
export const ROZETKA_DELIVERY_TYPE = 'rozetka_delivery';

export function isRozetkaDelivery(delivery: { delivery_service_id?: number | null } | null | undefined): boolean {
  return delivery?.delivery_service_id === ROZETKA_DELIVERY_SERVICE_ID;
}

/**
 * Адреса точки видачі. Орієнтир (place_number) додаємо як є — без «Відділення №»,
 * бо номера відділення в цій доставці не існує.
 */
export function rozetkaPickupAddress(d: {
  place_street?: string | null;
  place_house?: string | null;
  place_number?: string | null;
} | null | undefined, cityName: string): string {
  const landmark = d?.place_number?.trim();
  return [
    cityName || null,
    d?.place_street ?? null,
    d?.place_house ?? null,
    landmark || null,
  ].filter(Boolean).join(', ');
}
