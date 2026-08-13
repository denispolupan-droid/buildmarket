/**
 * «ROZETKA Доставка» як перевізник нашого сайту (rz-delivery.rozetka.ua).
 *
 * НЕ ПЛУТАТИ з lib/rozetka-delivery.ts: там доставка в точки видачі для замовлень,
 * що прийшли З МАРКЕТПЛЕЙСУ Rozetka (Seller API, розділ Octopus, номери «RMP-…»,
 * delivery_type='rozetka_delivery'). Тут — окремий договір партнера FXLine з
 * логістичною службою, свій кабінет, свій баланс і свій delivery_type. Обидва
 * оперують тими самими фізичними точками видачі, але API, номери накладних і
 * облік у них різні, і зшивати їх в одну гілку не можна.
 *
 * Що варто знати про це API (перевірено живими викликами):
 *
 *  1. Довідники (міста, відділення, перевізники, статуси) віддаються БЕЗ токена.
 *     Тому чекаут не тягне ключі — проксі потрібен лише заради кешу й фільтрів.
 *  2. Розрахунку вартості доставки в API НЕМАЄ ВЗАГАЛІ: `shipping_cost` приходить
 *     тільки у відповіді на створення накладної. Показати ціну в кошику нічим.
 *  3. Вебхуків немає — рух посилки лише опитуванням GET /api/track/status.
 *  4. `limitations.weight` в доці описано як грами, а по факту це КІЛОГРАМИ
 *     (по Харкову значення 30…500 при реальних лімітах точок видачі).
 *  5. Ліміт є і у відправника, і в отримувача. Наш склад здачі задає стелю на всі
 *     відправлення разом, точка покупця — на конкретне.
 */

export const RZ_API_URL = 'https://rz-delivery.rozetka.ua';

/** Наш delivery_type. Свій, а не 'rozetka_delivery' — те значення зайняте
 *  маркетплейсною доставкою, і на нього зав'язані комісії МП та інший синк. */
export const RZ_DELIVERY_TYPE = 'rz_delivery';

/** Перевізники з GET /api/carrier. Meest вимагає власного ключа в кабінеті
 *  Rozetka Delivery («Ідентифікатори API»), тому поки не вмикається. */
export const RZ_CARRIER_ROZETKA = '5498e0a0-ae1b-488c-89d5-3ea6db053edf';
export const RZ_CARRIER_MEEST   = '1a89d5af-c402-4938-a2f1-b2c1d042331a';

/** Відділення → відділення. Кур'єр (door) поки не вмикаємо. */
export const RZ_TRACK_TYPE_DEPT = 'dept-dept';

export type RzCity = {
  id: string;
  name: string;
  region_id: string;
  region_name: string;
  district_name?: string | null;
  population?: number | null;
};

export type RzDepartment = {
  id: string;
  name: string;
  public_name?: string | null;
  location?: { city_id?: string; city_name?: string; street_name?: string; house?: string } | null;
  schedule?: string[];
  limitations?: { weight?: number | null; volumeWeight?: number | null; length?: number | null; cost?: number | null } | null;
  can_receive_tracks?: boolean;
  can_give_out_tracks?: boolean;
  can_self_service?: boolean;
  carrier?: string;
  carrier_name?: string;
  has_meest_delivery?: boolean;
  department_type?: { id: number; name: string } | null;
};

/** Ліміт ваги точки, кг. null — обмеження не задано (трапляється). */
export function rzWeightLimitKg(d: RzDepartment | null | undefined): number | null {
  const w = d?.limitations?.weight;
  return typeof w === 'number' && w > 0 ? w : null;
}

/** Чи прийме точка посилку такої ваги. Без ліміту — приймає. */
export function rzFitsWeight(d: RzDepartment | null | undefined, weightKg: number): boolean {
  const limit = rzWeightLimitKg(d);
  return limit == null || weightKg <= limit;
}

/** Коротка назва точки для списку: «Полтавський Шлях вул., 140А». */
export function rzDepartmentLabel(d: RzDepartment): string {
  return (d.public_name?.trim() || d.name?.trim() || '').replace(/^м\.\s*[^,]+,\s*/i, '');
}

/** Повна адреса для замовлення: «м. Харків, Б.Хмельницького, 32 А». */
export function rzDepartmentAddress(d: RzDepartment, cityName?: string): string {
  const city = (cityName ?? d.location?.city_name ?? '').trim();
  const point = rzDepartmentLabel(d);
  if (!city) return point;
  return point && point !== city ? `${city}, ${point}` : city;
}

/**
 * Телефон у форматі, який приймає API: 380XXXXXXXXX (12 цифр, без «+»).
 * Порожній рядок — якщо номер не схожий на український мобільний; викидати тут
 * нема сенсу, перевірку робить викликач і показує зрозумілу помилку.
 */
export function rzPhone(raw: string | null | undefined): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('380')) return digits;
  if (digits.length === 11 && digits.startsWith('80'))  return '3' + digits;
  if (digits.length === 10 && digits.startsWith('0'))   return '38' + digits;
  if (digits.length === 9)                              return '380' + digits;
  return '';
}

/**
 * ПІБ у поля API. Наш `contact` збирається як «Прізвище Ім'я По батькові»
 * (див. app/cart/CartPageContent.tsx), тому порядок саме такий. first_name і
 * last_name обов'язкові: якщо в рядку одне слово, дублюємо його в прізвище —
 * інакше API відхилить накладну, а замовлення вже оплачене.
 */
export function rzSplitName(contact: string | null | undefined): {
  first_name: string; last_name: string; middle_name?: string;
} {
  const parts = (contact ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first_name: '', last_name: '' };
  if (parts.length === 1) return { first_name: parts[0], last_name: parts[0] };
  return {
    first_name: parts[1],
    last_name:  parts[0],
    ...(parts[2] ? { middle_name: parts.slice(2).join(' ') } : {}),
  };
}

/**
 * Фаза руху посилки за кодом статусу. Кодів 36, і читати їх поштучно в кожному
 * місці — гарантована розбіжність, тому зводимо до п'яти станів. Групи звірені з
 * GET /api/track-status (id 100…1300).
 *
 * 'unknown' — навмисно окремий стан, а не «в дорозі»: якщо Rozetka додасть код,
 * якого ми не знаємо, краще лишити замовлення як є (оновити тільки текст), ніж
 * помилково провести продаж або оголосити повернення.
 */
export type RzPhase = 'created' | 'accepted' | 'at_point' | 'delivered' | 'returning' | 'cancelled' | 'unknown';

const RZ_PHASE: Record<string, RzPhase> = {
  // 100 «Заплановано до відправки» — накладна є, посилка ще в нас
  planned:                          'created',
  readyForOctopus:                  'created',
  notAcceptedFromReception:         'created',
  // 200 «Прийнято на відправку»
  acceptedFromReception:            'accepted',
  acceptedFromMerchant:             'accepted',
  // 300 «В дорозі»
  placedInBatch:                    'accepted',
  readyToCarrier:                   'accepted',
  acceptedByCarrier:                'accepted',
  inTheWay:                         'accepted',
  acceptedOnDistributionCenter:     'accepted',
  forwarding:                       'accepted',
  arrivedToDistributionCenter:      'accepted',
  containerOnAcceptance:            'accepted',
  wrongLocation:                    'accepted',
  // 500 «У відділенні доставки» — покупцю пора йти забирати
  acceptedInDepartment:             'at_point',
  placedInStore:                    'at_point',
  readyToIssueOctopus:              'at_point',
  storageDateIncreased:             'at_point',
  // 600…1100 — відмова, прострочене зберігання, повернення
  clientCanceled:                   'returning',
  senderPending:                    'returning',
  storageDateExpired:               'returning',
  readyToReturn:                    'returning',
  unsuccessfulDelivery:             'returning',
  packingReturn:                    'returning',
  acceptedForCourierReturn:         'returning',
  acceptedOnDistributionCenterReturn:'returning',
  inTheWayReturn:                   'returning',
  wrongReturnLocation:              'returning',
  returnsAcceptance:                'returning',
  returned:                         'returning',
  // 400 «Видалено»
  toCancel:                         'cancelled',
  senderCanceled:                   'cancelled',
  cancelled:                        'cancelled',
  // 1200 «Видано»
  gaveOut:                          'delivered',
  gaveOutPartially:                 'delivered',
  gaveOutForShowcase:               'delivered',
};

export function rzPhase(status: string | null | undefined): RzPhase {
  if (!status) return 'unknown';
  return RZ_PHASE[status] ?? 'unknown';
}

/** Перевізник фізично взяв посилку — аналог carrier_accepted_at у НП. */
export function rzCarrierAccepted(status: string | null | undefined): boolean {
  const phase = rzPhase(status);
  return phase === 'accepted' || phase === 'at_point' || phase === 'delivered' || phase === 'returning';
}

/**
 * Сума післяплати — ЛИШЕ ЦІЛЕ ЧИСЛО гривень: «Сума зворотної доставки має бути
 * цілим числом» (перевірено живим запитом; в OpenAPI поле просто `number`, тож
 * з доки цього не видно). На замовленні #26081062 із сумою 97.20 накладна через
 * це не створювалась узагалі.
 *
 * Округлюємо, а не відкидаємо дробову частину — так само, як для Нової Пошти
 * (AfterpaymentOnGoodsCost у /api/admin/create-ttn). Якби один перевізник
 * округлював вниз, а інший до найближчого, на тому самому замовленні в касі
 * були б різні суми, і звірка оплат розходилась би по-різному залежно від
 * доставки. Оголошена вартість (insurance_cost) дробову приймає — не чіпаємо.
 */
export const rzCodAmount = (sum: number): number => Math.max(0, Math.round(sum));

export type RzValidationDetail = {
  property?: string;
  constraints?: Record<string, string>;
  /** Вкладені причини: у верхнього вузла constraints порожні, суть — тут. */
  children?: RzValidationDetail[];
};

export type RzErrorBody = {
  message?: string | string[] | Record<string, unknown>;
  error?: string;
  details?: RzValidationDetail[];
};

/**
 * Текст помилки з відповіді API.
 *
 * Причини ВКЛАДЕНІ: у верхнього вузла `data` constraints порожні, а справжня
 * претензія лежить у children («data.cost → має бути цілим числом»). Перша
 * версія читала лише верхній рівень і показувала менеджеру «Помилка валідації
 * даних — data:» — тобто рівно нічого, і причину довелося діставати ручним
 * запитом до API. Тому обхід рекурсивний, зі шляхом через крапку.
 */
export function rzErrorText(body: RzErrorBody | null | undefined, httpStatus: number): string {
  const m = body?.message;
  const head = Array.isArray(m) ? m.filter(Boolean).join('; ')
    : typeof m === 'string' ? m
    : (body?.error ?? '');

  const reasons: string[] = [];
  const walk = (list: RzValidationDetail[] | undefined, path: string[]) => {
    for (const d of list ?? []) {
      const here = [...path, d.property ?? ''].filter(Boolean);
      const constraints = Object.values(d.constraints ?? {}).filter(Boolean);
      if (constraints.length) reasons.push(`${here.join('.')}: ${constraints.join(', ')}`);
      walk(d.children, here);
    }
  };
  walk(body?.details, []);

  const text = [head, ...reasons].filter(Boolean).join(' — ');
  return text || `ROZETKA Доставка: HTTP ${httpStatus}`;
}
