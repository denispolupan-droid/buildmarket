/**
 * Адреса одержувача для кур'єрської (адресної) доставки Нової Пошти.
 *
 * Чому окремий модуль. До 28.10.2026 рядок «Місто, вул. Х, 12, кв. 5» розбирали
 * двома регулярками в роуті, і майже кожне кур'єрське замовлення падало з
 * «Не вдалося розібрати адресу» або «Вулицю не знайдено»: «24 А», «кв. а»,
 * «буд.3», «Набережна вул.», «Свинаренко Петра» (НП пише «Свинаренка Петра»),
 * «просп. Полтавський» (НП шукає лише по назві, без типу). Менеджер обирав
 * відділення і правив накладну руками в кабінеті НП.
 *
 * Що тут:
 *  - parseAddress — розбір вільного рядка на вулицю/тип/будинок/квартиру;
 *  - stem / rankStreets / resolveStreet — пошук вулиці в довіднику НП за
 *    основою слова (без відмінкового закінчення) і вибір найкращого збігу;
 *  - structuredFromRozetka / structuredFromProm — готові частини адреси з даних
 *    маркетплейсу (Prom віддає навіть NP-референси міста й вулиці).
 *
 * Усі функції чисті або з інжектованим викликом НП — покриті tests/np-address.test.ts
 * і перевірені живим read-only пошуком по реальних адресах замовлень.
 */

export type ParsedAddress = {
  street: string;
  /** Тип вулиці у формі довідника НП: «вул.», «просп.», «пров.», «бульв.», «площа», «наб.», «шосе»… */
  streetType: string | null;
  house: string;
  flat: string;
};

export type StreetCandidate = { ref: string; description: string; type: string };

// Типи вулиць: як пишуть люди/маркетплейси → як у довіднику НП (StreetsType).
const STREET_TYPES: [RegExp, string][] = [
  [/^(вул\.?|вулиця|ул\.?|улица)$/i, 'вул.'],
  [/^(просп\.?|пр-т|пр\.?|проспект)$/i, 'просп.'],
  [/^(пров\.?|пер\.?|провулок|переулок)$/i, 'пров.'],
  [/^(бул\.?|бульв\.?|б-р|бульвар)$/i, 'бульв.'],
  [/^(пл\.?|площа|площадь)$/i, 'площа'],
  [/^(наб\.?|набережна|набережная)$/i, 'наб.'],
  [/^(ш\.?|шосе|шоссе)$/i, 'шосе'],
  [/^(в'їзд|вїзд|въезд)$/i, "в'їзд"],
  [/^(проїзд|проезд)$/i, 'проїзд'],
  [/^(туп\.?|тупик)$/i, 'тупик'],
  [/^(узвіз|спуск)$/i, 'узвіз'],
];

function streetTypeOf(word: string): string | null {
  const w = word.replace(/’/g, "'").trim();
  for (const [re, canon] of STREET_TYPES) if (re.test(w)) return canon;
  return null;
}

const FLAT_RE = /(?:^|,)\s*(?:кв\.?|квартира|apt\.?|оф\.?|офіс|office)\s*([^,]*)$/i;
const HOUSE_PREFIX_RE = /^(?:буд\.?|будинок|б\.|дом|д\.)\s*/i;

/** «24 А» → «24А», «6 а» → «6а»; «43/10», «12-А», «б/н» лишаються як є. */
export function normalizeHouse(raw: string): string {
  return raw
    .replace(HOUSE_PREFIX_RE, '')
    .replace(/\s*\/\s*/g, '/')
    .replace(/(\d)\s+([а-яіїєґa-z])$/i, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

function isHouseToken(t: string): boolean {
  const s = t.replace(HOUSE_PREFIX_RE, '');
  return /^\d/.test(s) || /^б\/н$/i.test(s);
}

/**
 * Розбір рядка адреси. Терпить назву міста спереду («Кременчук, просп.
 * Полтавський, 2»), область у дужках, тип вулиці спереду або ззаду («Набережна
 * вул.»), подвоєний тип («вул. вул. Кооперативна»), «буд.3», «24 А», квартиру
 * без цифри («кв. а»). Квартира без жодної цифри довша за 4 символи — це
 * примітка («кв. до будинку»), а не квартира: у поле Flat НП її не кладемо.
 */
export function parseAddress(raw: string, cityName?: string | null): ParsedAddress {
  let s = (raw || '').replace(/\s+/g, ' ').replace(/\([^)]*\)/g, '').trim();

  let flat = '';
  const flatM = s.match(FLAT_RE);
  if (flatM && flatM.index != null) {
    flat = flatM[1].trim();
    s = s.slice(0, flatM.index).trim();
    if (flat && !/\d/.test(flat) && flat.length > 4) flat = '';
  }

  let tokens = s.split(',').map(t => t.trim()).filter(Boolean);

  // Місто спереду: або збігається з назвою міста замовлення, або це перший з
  // трьох і більше токенів без цифр і без типу вулиці («Розкопанці, Ігоря Гамарника, 12»).
  const cn = (cityName || '').trim().toLowerCase();
  if (tokens.length >= 2) {
    const first = tokens[0].toLowerCase();
    const firstWords = tokens[0].split(/\s+/);
    const hasType = firstWords.some(w => streetTypeOf(w));
    const looksLikeCity = (cn && (first === cn || first.startsWith(cn + ' ') || cn.startsWith(first)))
      || (tokens.length >= 3 && !hasType && !/\d/.test(tokens[0]));
    if (looksLikeCity) tokens = tokens.slice(1);
  }

  let house = '';
  if (tokens.length >= 2 && isHouseToken(tokens[tokens.length - 1])) {
    house = normalizeHouse(tokens.pop()!);
  } else if (tokens.length >= 1) {
    // «вул. Калинова 104» — номер приклеєний до вулиці пробілом
    const m = tokens[tokens.length - 1].match(/^(.*\p{L})\s+((?:буд\.?\s*)?\d[^\s]*(?:\s[а-яіїєґa-z])?)$/iu);
    if (m) { tokens[tokens.length - 1] = m[1]; house = normalizeHouse(m[2]); }
  }

  let streetType: string | null = null;
  const words = tokens.join(' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const kept: string[] = [];
  const removed: { word: string; type: string }[] = [];
  for (const w of words) {
    const t = streetTypeOf(w);
    if (t) { removed.push({ word: w, type: t }); continue; }
    kept.push(w);
  }
  if (!kept.length && removed.length) {
    // «Набережна вул.», «Садова вулиця»: повне слово тут — назва, а не тип.
    // Типом лишається скорочення з крапкою (або нічого).
    for (const r of removed) (/\.$/.test(r.word) || r.word.length <= 3 ? [] : kept).push(r.word);
    const abbr = removed.find(r => /\.$/.test(r.word) || r.word.length <= 3);
    streetType = abbr?.type ?? null;
  } else {
    streetType = removed[0]?.type ?? null;
  }
  const street = kept.join(' ').replace(/^[\s,.-]+|[\s,.-]+$/g, '').trim();

  return { street, streetType, house, flat };
}

/**
 * Основа слова без відмінкового закінчення — для FindByString у довіднику НП,
 * який шукає підрядок: «Хмельницького» → «хмельницьк» знаходить «просп.
 * Хмельницького Богдана», «Свинаренко» → «свинаренк» знаходить «Свинаренка Петра».
 */
export function stem(word: string): string {
  const w = word.toLowerCase().replace(/[’`]/g, "'").replace(/[^\p{L}'-]/gu, '');
  if (w.length <= 4) return w;
  const cut = w.replace(/(ього|ього|ого|его|ому|ему|ими|ами|ої|ою|ій|ий|ия|ая|ое|ее|а|я|у|ю|і|ї|є|и|е|о|ь|й)$/u, '');
  return cut.length >= 4 ? cut : w;
}

/** Значущі слова вулиці: без ініціалів і коротких службових слів, найдовші першими. */
export function significantStems(street: string): string[] {
  return street
    .split(/\s+/)
    .map(w => w.replace(/[^\p{L}'’-]/gu, ''))
    .filter(w => w.length >= 3)
    .sort((a, b) => b.length - a.length)
    .map(stem);
}

/**
 * Вибір вулиці серед кандидатів НП: мають бути присутні ВСІ значущі основи
 * запиту (тому «Полтавський Шлях» програє «Полтавському», якщо просили один
 * «Полтавський»… але обидва проходять, і далі вирішує тип), далі збіг типу,
 * далі однакова кількість слів, далі «вул.» як найчастіший тип.
 */
export function rankStreets(candidates: StreetCandidate[], parsed: Pick<ParsedAddress, 'street' | 'streetType'>): StreetCandidate | null {
  const need = significantStems(parsed.street);
  if (!need.length) return null;
  const reqWords = parsed.street.split(/\s+/).filter(Boolean).length;
  let best: { c: StreetCandidate; score: number } | null = null;
  for (const c of candidates) {
    const hay = c.description.toLowerCase().replace(/[’`]/g, "'");
    if (!need.every(st => hay.includes(st))) continue;
    let score = 10;
    if (parsed.streetType && c.type.toLowerCase() === parsed.streetType.toLowerCase()) score += 5;
    const candWords = c.description.replace(/\([^)]*\)/g, '').split(/\s+/).filter(Boolean).length;
    if (candWords === reqWords) score += 2;
    if (!parsed.streetType && c.type.toLowerCase() === 'вул.') score += 1;
    if (!best || score > best.score) best = { c, score };
  }
  return best?.c ?? null;
}

export type NpCall = (modelName: string, calledMethod: string, props: Record<string, unknown>) => Promise<{ success?: boolean; data?: unknown[]; errors?: string[] }>;

type NpStreetRow = { Ref: string; Description: string; StreetsType: string };
type NpSettlementStreetRow = { SettlementStreetRef: string; SettlementStreetDescription: string; StreetsType: string; Present: string };

export type StreetSuggestion = { ref: string; label: string; kind: 'city' | 'settlement' };

export type ResolvedStreet =
  | { kind: 'city'; ref: string; label: string }
  | { kind: 'settlement'; ref: string; label: string }
  | { kind: 'none'; suggestions: StreetSuggestion[] };

/**
 * Пошук вулиці в НП. Спочатку міський довідник (Address.getStreet за CityRef —
 * саме його Ref приймає Address.save), потім довідник населеного пункту
 * (searchSettlementStreets за SettlementRef — єдиний, де є вулиці сіл).
 * Шукаємо за основою найдовшого слова, потім за іншими словами, потім за
 * повною назвою; кожну видачу проганяємо через rankStreets.
 */
export async function resolveStreet(
  np: NpCall,
  opts: { cityRef: string | null; settlementRef: string | null; parsed: Pick<ParsedAddress, 'street' | 'streetType'> },
): Promise<ResolvedStreet> {
  const terms = [...new Set([...significantStems(opts.parsed.street), opts.parsed.street.toLowerCase()])].filter(Boolean);
  const seen = new Map<string, StreetSuggestion>();

  if (opts.cityRef) {
    for (const term of terms) {
      const res = await np('Address', 'getStreet', { CityRef: opts.cityRef, FindByString: term, Limit: 50, Page: 1 });
      const rows = ((res.data ?? []) as NpStreetRow[]).filter(r => r?.Ref && r?.Description);
      const cands = rows.map(r => ({ ref: r.Ref, description: r.Description, type: r.StreetsType ?? '' }));
      for (const c of cands) seen.set(c.ref, { ref: c.ref, label: `${c.type} ${c.description}`.trim(), kind: 'city' });
      const best = rankStreets(cands, opts.parsed);
      if (best) return { kind: 'city', ref: best.ref, label: `${best.type} ${best.description}`.trim() };
    }
  }

  if (opts.settlementRef) {
    for (const term of terms) {
      const res = await np('Address', 'searchSettlementStreets', { SettlementRef: opts.settlementRef, StreetName: term, Limit: 50 });
      const first = (res.data ?? [])[0] as { Addresses?: NpSettlementStreetRow[] } | undefined;
      const rows = (first?.Addresses ?? []).filter(r => r?.SettlementStreetRef);
      const cands = rows.map(r => ({ ref: r.SettlementStreetRef, description: r.SettlementStreetDescription ?? r.Present, type: r.StreetsType ?? '' }));
      for (const c of cands) seen.set(c.ref, { ref: c.ref, label: `${c.type} ${c.description}`.trim(), kind: 'settlement' });
      const best = rankStreets(cands, opts.parsed);
      if (best) return { kind: 'settlement', ref: best.ref, label: `${best.type} ${best.description}`.trim() };
    }
  }

  return { kind: 'none', suggestions: [...seen.values()].slice(0, 6) };
}

/**
 * SettlementRef (те, що обирає модалка через searchSettlements) → CityRef, який
 * потрібен Counterparty.save, Address.save і CityRecipient. Найнадійніше —
 * CityRef будь-якого складу цього населеного пункту; у селах без відділень —
 * DeliveryCity із getSettlements.
 */
export async function resolveCityRef(np: NpCall, settlementRef: string): Promise<string | null> {
  const wh = await np('Address', 'getWarehouses', { SettlementRef: settlementRef, Limit: 1, Page: 1 });
  const fromWh = (wh.data?.[0] as { CityRef?: string } | undefined)?.CityRef;
  if (fromWh) return fromWh;
  const st = await np('Address', 'getSettlements', { Ref: settlementRef, Limit: 1 });
  const delivery = (st.data?.[0] as { DeliveryCity?: string } | undefined)?.DeliveryCity;
  return delivery && delivery !== settlementRef ? delivery : null;
}

export type CourierAddressInput = {
  /** Текст із поля модалки (авто-підставлений із замовлення або виправлений менеджером) */
  text: string;
  cityName: string | null;
  rz: RozetkaDelivery;
  pm: PromProviderData;
  settlementRef: string;
  cityRef: string;
};

export type CourierAddressOk = {
  ok: true;
  source: 'prom' | 'rozetka' | 'text';
  kind: 'city' | 'settlement';
  streetRef: string;
  streetLabel: string;
  house: string;
  flat: string;
  /** «просп. Полтавський, 2, кв. а» — що піде в НП */
  label: string;
};
export type CourierAddressFail = {
  ok: false;
  reason: 'parse' | 'not_found';
  error: string;
  parsed: ParsedAddress;
  suggestions: StreetSuggestion[];
};
export type CourierAddressResult = CourierAddressOk | CourierAddressFail;

/**
 * Повний шлях від того, що є в замовленні й полі модалки, до вулиці/будинку/
 * квартири для НП. Джерела за пріоритетом: Prom (готові NP-референси) →
 * Rozetka (окремі поля) → розбір тексту. Структуровані дані беремо лише поки
 * менеджер не змінив номер будинку в полі — інакше вірити треба йому.
 * Одна й та сама функція обслуговує і підказку в модалці, і створення ЕН —
 * менеджер бачить саме те, що піде в накладну.
 */
export async function prepareCourierAddress(np: NpCall, input: CourierAddressInput): Promise<CourierAddressResult> {
  const typed = parseAddress(input.text, input.cityName);
  const promRefs = structuredFromProm(input.pm);
  if (promRefs && promRefs.cityRef === input.cityRef && textKeepsAddress(input.text, promRefs.house, promRefs.streetName)) {
    const flat = typed.flat || promRefs.flat;
    return {
      ok: true, source: 'prom', kind: 'city', streetRef: promRefs.streetRef, streetLabel: promRefs.streetName,
      house: promRefs.house, flat, label: addressLabel(promRefs.streetName, promRefs.house, flat),
    };
  }

  const rzParsed = structuredFromRozetka(input.rz);
  const fromRz = !!rzParsed && textKeepsAddress(input.text, rzParsed.house, rzParsed.street);
  const parsed: ParsedAddress = fromRz ? { ...rzParsed!, flat: typed.flat || rzParsed!.flat } : typed;
  if (!parsed.street || !parsed.house) {
    return {
      ok: false, reason: 'parse', parsed, suggestions: [],
      error: 'Не вдалося розібрати адресу. Вкажіть вулицю та номер будинку (напр. «вул. Калинова, 104»).',
    };
  }

  const found = await resolveStreet(np, { cityRef: input.cityRef, settlementRef: input.settlementRef, parsed });
  if (found.kind === 'none') {
    const hint = found.suggestions.length
      ? ` Схожі вулиці в довіднику НП: ${found.suggestions.map(s => s.label).join('; ')} — оберіть одну або виправте назву.`
      : ' Перевірте місто й назву вулиці в полі адреси.';
    return {
      ok: false, reason: 'not_found', parsed, suggestions: found.suggestions,
      error: `Вулицю «${parsed.street}» не знайдено в Новій Пошті для цього міста.${hint}`,
    };
  }
  return {
    ok: true, source: fromRz ? 'rozetka' : 'text', kind: found.kind, streetRef: found.ref, streetLabel: found.label,
    house: parsed.house, flat: parsed.flat, label: addressLabel(found.label, parsed.house, parsed.flat),
  };
}

// ── Структуровані дані маркетплейсів ────────────────────────────────────────

export type RozetkaDelivery = {
  place_street?: string | null; place_house?: string | null; place_flat?: string | null; place_number?: string | null;
} | null | undefined;

/** Rozetka: вулиця/будинок/квартира лежать окремими полями — не треба нічого розбирати. */
export function structuredFromRozetka(del: RozetkaDelivery): ParsedAddress | null {
  const house = (del?.place_house ?? '').trim();
  const streetRaw = (del?.place_street ?? '').trim();
  if (!house || !streetRaw) return null;
  const p = parseAddress(`${streetRaw}, ${house}`);
  if (!p.street || !p.house) return null;
  const flat = (del?.place_flat ?? '').trim();
  return { ...p, flat: flat && (/\d/.test(flat) || flat.length <= 4) ? flat : '' };
}

export type PromProviderData = {
  provider?: string | null;
  recipient_address?: {
    city_id?: string | null; street_id?: string | null; street_name?: string | null;
    building_number?: string | null; apartment_number?: string | null;
  } | null;
} | null | undefined;

export type PromAddressRefs = { cityRef: string; streetRef: string; streetName: string; house: string; flat: string };

/**
 * Prom передає справжні NP-референси (перевірено наживо 28.10.2026: street_id
 * збігається з Ref із Address.getStreet, city_id — CityRef). З ними Address.save
 * можна робити одразу, без пошуку.
 */
export function structuredFromProm(pd: PromProviderData): PromAddressRefs | null {
  if (!pd || (pd.provider && pd.provider !== 'nova_poshta')) return null;
  const a = pd.recipient_address;
  if (!a?.city_id || !a?.street_id || !a?.building_number) return null;
  return {
    cityRef: a.city_id,
    streetRef: a.street_id,
    streetName: a.street_name ?? '',
    house: normalizeHouse(String(a.building_number)),
    flat: (a.apartment_number ?? '').toString().trim(),
  };
}

/**
 * Чи текст менеджера з модалки — це все ще адреса замовлення, а не правка.
 * Структуровані дані маркетплейсу беремо лише тоді, коли в тексті лишився той
 * самий номер будинку: якщо менеджер виправив будинок — вірити треба йому.
 */
export function textKeepsHouse(text: string | null | undefined, house: string): boolean {
  if (!text || !house) return false;
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
  return norm(text).includes(norm(house));
}

/**
 * Те саме, але ще й вулиця: менеджер міг лишити будинок і замінити вулицю
 * («вул. Соборна, 2» замість «просп. Полтавський, 2») — тоді дані маркетплейсу
 * вже не про цю адресу. Порівнюємо за основою найдовшого слова, щоб відмінок
 * і тип («Полтавська» / «Полтавський») не вважались іншою вулицею.
 */
export function textKeepsAddress(text: string | null | undefined, house: string, street: string): boolean {
  if (!textKeepsHouse(text, house)) return false;
  const [mainStem] = significantStems(street);
  if (!mainStem) return true;
  return (text ?? '').toLowerCase().replace(/[’`]/g, "'").includes(mainStem);
}

/** Людський підпис адреси для снапшоту ЕН і повідомлень. */
export function addressLabel(streetLabel: string, house: string, flat: string): string {
  return [streetLabel, house, flat ? `кв. ${flat}` : ''].filter(Boolean).join(', ');
}

/**
 * Поля квартири для `Address.save` НП. Перевірено наживо 28.10.2026 на
 * просп. Полтавський, 2 (Кременчук): Flat «а» і «А» → «Flat has invalid format»,
 * «2а» і порожнє приймає — квартира в НП мусить починатися з цифри. Через це
 * #26101202 (Rozetka віддала place_flat «а») не виписувалась кур'єром.
 * Таку квартиру кладемо в Note (до 40 символів, НП дописує її в опис адреси,
 * кур'єр її бачить), а Flat лишаємо порожнім.
 */
export function npFlatFields(flat: string): { Flat: string; Note?: string } {
  const f = flat.trim();
  if (!f) return { Flat: '' };
  if (/^\d/.test(f)) return { Flat: f };
  return { Flat: '', Note: `кв. ${f}`.slice(0, 40) };
}
