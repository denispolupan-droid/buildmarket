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
 * delivery_service_name, яке Rozetka може переписати. 5 — Нова Пошта, 4 — Meest,
 * 43660 — поштомати НП.
 *
 * Своїх ідентифікаторів у Rozetka виявилось кілька: 1 («ROZETKA Delivery») і
 * 56214 («Rozetka Delivery (Партнерські відділення)»). Про другий ми не знали,
 * і такі замовлення падали в 'courier' — картка писала «Доставка не Нова Пошта»
 * й пропонувала оформити ТТН НП на посилку, яку точка видачі не прийме. Тому
 * список, а не одне число, плюс запасна перевірка за назвою: якщо Rozetka
 * заведе ще один id, замовлення не поїде знову в НП.
 */

export const ROZETKA_DELIVERY_SERVICE_IDS = [1, 56214];

/** Наш delivery_type для таких замовлень. Свій, а не 'courier': на 'courier' зав'язана логіка НП. */
export const ROZETKA_DELIVERY_TYPE = 'rozetka_delivery';

export function isRozetkaDelivery(
  delivery: { delivery_service_id?: number | null; delivery_service_name?: string | null } | null | undefined,
): boolean {
  if (!delivery) return false;
  if (delivery.delivery_service_id != null && ROZETKA_DELIVERY_SERVICE_IDS.includes(delivery.delivery_service_id)) return true;
  return (delivery.delivery_service_name ?? '').toLowerCase().includes('rozetka delivery');
}

/** Рядок GET /delivery-rozetka/find-sender-pickups — лише поля, які читаємо. */
export type RozetkaSenderPickupRaw = {
  id?: string | null;
  pickup_id: string;
  name_uk?: string | null;
  name_ru?: string | null;
  house_number?: string | null;
  street?: {
    name_uk?: string | null;
    type?: { short_name_uk?: string | null } | null;
    city?: { id?: string | null; name_uk?: string | null } | null;
  } | null;
  max_weight?: number | string | null;
  max_physical_weight?: number | string | null;
  pickupTypeMapped?: number | null;
};

/** Точка відправника в тому вигляді, який потрібен модалці та відправнику накладної. */
export type RozetkaSenderPickup = {
  /** uuid відділення — він же sender.department у create-order-ttn */
  id: string;
  /** Коротко, без міста: «вул. Богдана Хмельницького, 32 А» */
  label: string;
  /** Повна адреса для sender.address: «Харків, вул. Богдана Хмельницького, 32 А» */
  address: string;
  cityId: string;
  cityName: string;
  /** Скільки кг точка приймає від відправника; null — ліміт не вказано */
  limitKg: number | null;
  /** pickupTypeMapped: 0 — стандартне, 1 — міні, 2 — поштомат, 3 — Meest */
  typeMapped: number;
};

/**
 * Нормалізація точки відправника з довідника Seller API.
 *
 * Назву збираємо з вулиці й будинку, а не беремо name_uk як є: у довіднику вона
 * то з містом («Харків, вул.вул. Б.Хмельницького, 32 А» — з подвоєним «вул.»),
 * то без («Стадіонний пр., 5А»). Місто передається окремо (cityId/cityName), бо
 * у деяких точок street=null — тоді беремо його з запиту, а не з рядка.
 *
 * Ліміт — найменше з max_weight і max_physical_weight (обидва бувають null або
 * рядком «30.000»). Об'ємну вагу не чіпаємо: це інша величина.
 */
export function normalizeSenderPickup(
  raw: RozetkaSenderPickupRaw,
  city: { id: string; name: string },
): RozetkaSenderPickup {
  const cityName = raw.street?.city?.name_uk?.trim() || city.name;
  const cityId = raw.street?.city?.id || city.id;

  let label = '';
  const streetName = raw.street?.name_uk?.trim();
  if (streetName) {
    const type = raw.street?.type?.short_name_uk?.trim();
    const house = raw.house_number?.trim();
    label = [type ? `${type} ${streetName}` : streetName, house || null].filter(Boolean).join(', ');
  } else {
    label = (raw.name_uk ?? raw.name_ru ?? '').trim();
    // Прибираємо префікс міста, якщо він є, і подвоєні скорочення типу «вул.вул.»
    if (cityName && label.toLowerCase().startsWith(cityName.toLowerCase() + ',')) {
      label = label.slice(cityName.length + 1).trim();
    }
    // \b не працює з кирилицею, тому без межі слова
    label = label.replace(/(^|[\s,])(вул|пр-т|пр|просп|пров|б-р|бул)\.\s*\2\./giu, '$1$2.');
  }

  const num = (v: unknown): number | null => {
    const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const limits = [num(raw.max_weight), num(raw.max_physical_weight)].filter((n): n is number => n != null);

  return {
    id: raw.pickup_id,
    label,
    address: label && cityName ? `${cityName}, ${label}` : (label || cityName),
    cityId,
    cityName,
    limitKg: limits.length ? Math.min(...limits) : null,
    typeMapped: typeof raw.pickupTypeMapped === 'number' ? raw.pickupTypeMapped : 0,
  };
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
