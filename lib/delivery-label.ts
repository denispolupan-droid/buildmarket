// Рядок доставки для списку замовлень.
//
// Адреса, яку віддають маркетплейси, часто вже містить назву міста
// («Немішаєве» + «Немішаєве, Поштомат №1»), і склеювання «місто · адреса»
// давало «Немішаєве · Немішаєве, По…» — половину колонки з'їдав повтор, а
// корисне (номер відділення) не влізало. Тому місто з початку адреси зрізаємо.

/**
 * Хто везе і куди йти забирати — для листів і повідомлень покупцю.
 *
 * З'явилось не від хорошого життя: «Нова Пошта» була вписана в шаблони листів
 * шістьма окремими рядками, і перше ж замовлення в точку видачі ROZETKA
 * повідомило покупцю, що це накладений платіж Нової Пошти. Тому назва
 * перевізника, посилання на трекінг і слово для місця видачі живуть в одному
 * місці й беруться з delivery_type.
 *
 * Невідомий тип — Нова Пошта: нею їде переважна більшість замовлень, і мовчазний
 * фолбек на неї гірший рівно в тих випадках, коли новий перевізник забули сюди
 * додати. Додавай сюди, а не в шаблон.
 */
export type CarrierInfo = {
  /** Назва перевізника в тексті: «Нова Пошта». */
  name: string;
  /** Сторінка відстеження або null, якщо публічного трекінгу немає. */
  trackUrl: string | null;
  /** Де покупець отримує і платить: «у відділенні Нової Пошти». */
  place: string;
};

const NOVA: CarrierInfo = {
  name: 'Нова Пошта',
  trackUrl: 'https://novaposhta.ua',
  place: 'у відділенні Нової Пошти',
};

const CARRIERS: Record<string, CarrierInfo> = {
  nova: NOVA,
  nova_poshta: NOVA,
  // Наш договір з rz-delivery (замовлення сайту) і маркетплейсна доставка в ті
  // самі точки — для покупця це одне й те саме місце, тому й текст однаковий.
  rz_delivery:      { name: 'ROZETKA Доставка', trackUrl: 'https://rozetka.delivery/tracking', place: 'у точці видачі ROZETKA' },
  rozetka_delivery: { name: 'ROZETKA Доставка', trackUrl: 'https://rozetka.delivery/tracking', place: 'у точці видачі ROZETKA' },
  ukrposhta:        { name: 'Укрпошта',         trackUrl: 'https://track.ukrposhta.ua',        place: 'у відділенні Укрпошти' },
  pickup:           { name: 'Самовивіз',        trackUrl: null,                                place: 'на нашому складі' },
  kharkiv:          { name: 'Доставка по Харкову', trackUrl: null,                             place: 'при отриманні' },
};

export function carrierInfo(deliveryType?: string | null): CarrierInfo {
  return CARRIERS[(deliveryType ?? '').trim()] ?? NOVA;
}

/**
 * Посилання на конкретну посилку. НП уміє глибокий лінк із номером у query,
 * ROZETKA — ні (форма на сторінці), тому туди ведемо просто на трекінг. Номер
 * підставляти навмання не можна: непрацюючий лінк гірший за його відсутність.
 */
export function trackHref(deliveryType: string | null | undefined, trackingNumber?: string | null): string | null {
  const c = carrierInfo(deliveryType);
  if (!c.trackUrl || !trackingNumber) return c.trackUrl;
  return c === NOVA ? `${c.trackUrl}/tracking/?cargo_number=${encodeURIComponent(trackingNumber)}` : c.trackUrl;
}

export type DeliveryParts = {
  delivery_type?: string | null;
  delivery_subtype?: string | null;
  delivery_city_name?: string | null;
  delivery_address?: string | null;
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Прибирає з початку адреси назву міста разом із розділювачем і префіксами «м.», «смт». */
export function stripCityPrefix(address: string, city: string): string {
  const addr = (address ?? '').trim();
  const town = (city ?? '').trim();
  if (!addr || !town) return addr;
  const re = new RegExp(`^(?:м\\.?|смт\\.?|с\\.?)?\\s*${escapeRegExp(town)}\\s*[,·-]*\\s*`, 'i');
  const stripped = addr.replace(re, '').trim();
  // Якщо після зрізання не лишилось нічого — краще показати адресу як є,
  // ніж порожнє місце (адреса дорівнювала назві міста).
  return stripped || addr;
}

/**
 * Коротка назва точки видачі: «№7 (до 30 кг на одне місце): вул. Шевченка, 3»
 * → «Відділення №7». Перевізники пишуть у назві і ліміт ваги, і вулицю зі
 * будинком — у рядку списку це з'їдає всю колонку, а для впізнавання досить
 * номера. Кур'єрську адресу не чіпаємо: там вулиця і є сенсом.
 */
export function shortenWarehouse(address: string, isCourier = false): string {
  const addr = (address ?? '').trim();
  if (!addr || isCourier) return addr;
  const head = addr.split(':')[0];              // відсікаємо вулицю після двокрапки
  const noParens = head.replace(/\s*\([^)]*\)/g, '').trim();
  const clean = (noParens || head).replace(/[,\s]+$/, '');
  // «№7» без слова — додаємо «Відділення», інакше рядок читається як шум
  return /^№/.test(clean) ? `Відділення ${clean}` : clean;
}

/** Місто + коротка точка видачі, без вулиці. Для рядка списку замовлень. */
export function deliveryPlace(o: DeliveryParts, fallback = ''): string {
  if (o.delivery_type === 'pickup') return 'Самовивіз';
  const city = (o.delivery_city_name ?? '').trim();
  const isCourier = o.delivery_subtype === 'courier';
  const address = shortenWarehouse(stripCityPrefix(o.delivery_address ?? '', city), isCourier);
  const head = city || address;
  if (!head) return fallback;
  return city && address && address !== city ? `${head} · ${address}` : head;
}
