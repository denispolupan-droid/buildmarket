/**
 * Перевізники за delivery_type — що вміє наш код для кожного. Чистий модуль
 * (без мережі й ключів): його читають і крони, і клієнтська адмінка.
 *
 * Навіщо окремо. Укрпошта й Meest приходять із маркетплейсів (Rozetka, Prom,
 * Епіцентр), але API цих перевізників у нас ще немає. До 02.11.2026 майже весь
 * код після імпорту вважав «не Rozetka» = «Нова Пошта»: їхні номери йшли в
 * трекінг НП, кошик видаляв їх через API НП, а імпорт Rozetka/Prom записував
 * Meest як nova_poshta (#26101130, #26091224, #26101231). Тому список «чужих
 * для НП» перевізників живе тут, а не розкиданими порівняннями рядків.
 */

/** Поштові перевізники, накладні яких оформлюються поза нашим API (кабінет перевізника чи площадки). */
export const MANUAL_POSTAL_CARRIERS = ['ukrposhta', 'meest'] as const;

export type ManualPostalCarrier = (typeof MANUAL_POSTAL_CARRIERS)[number];

export function isManualPostalCarrier(t: string | null | undefined): t is ManualPostalCarrier {
  return (MANUAL_POSTAL_CARRIERS as readonly string[]).includes((t ?? '').trim());
}

/** Нова Пошта: обидва історичні написання (сайт пише 'nova', маркетплейси — 'nova_poshta'). */
export function isNovaPoshta(t: string | null | undefined): boolean {
  return t === 'nova' || t === 'nova_poshta';
}

/**
 * Чи питати про номер Нову Пошту (крон статусів). Ні — для точок видачі Rozetka
 * (свої номери «RMP-…» і свій трекінг), для ROZETKA Доставки власного договору
 * і для Укрпошти/Meest: НП їхніх номерів не знає, і замовлення отримувало б
 * «Номер не знайдено» замість статусу. Решта (у т.ч. невідомі типи) — як і раніше, НП.
 */
export function isNpTracked(t: string | null | undefined): boolean {
  if (t === 'rozetka_delivery' || t === 'rz_delivery') return false;
  return !isManualPostalCarrier(t);
}

/** Людська назва перевізника для підпису в адмінці. */
export const MANUAL_CARRIER_LABEL: Record<ManualPostalCarrier, string> = {
  ukrposhta: 'Укрпошта',
  meest: 'Meest',
};

/**
 * Номер накладної на вигляд. Укрпошта — штрихкод із 13 цифр (0500012345678) або
 * міжнародний формат (RR123456789UA); Meest — форматів кілька (Prom показував
 * «723-4228988», API віддає barCode іншого вигляду), тож для нього лише латиниця,
 * цифри й дефіс. Перевірка м'яка: відсікає явне сміття (пробіли, кирилицю,
 * обрізаний номер), а не вгадує формат, який перевізник може змінити.
 */
export function looksLikeManualTtn(carrier: ManualPostalCarrier, raw: string): boolean {
  const s = raw.trim().toUpperCase();
  if (carrier === 'ukrposhta') return /^(\d{13}|[A-Z]{2}\d{9}[A-Z]{2})$/.test(s);
  return /^[A-Z0-9][A-Z0-9-]{6,24}$/.test(s) && /\d{6}/.test(s.replace(/-/g, ''));
}
