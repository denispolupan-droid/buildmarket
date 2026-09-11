/**
 * Характеристики для Епіцентру: наші product_characteristics → атрибути набору
 * Епіцентру з paramcode/valuecode (вимога XML: значення мають бути з їхніх
 * довідників, вільний текст ігнорується).
 *
 * Дані наборів — lib/data/epicentr-attributes.json (scripts/epicentr-attributes-sync.mts).
 * Для кожного атрибута набору перебираємо джерела в товарі (характеристики за
 * синонімами назви, фасування, колір), далі за типом атрибута:
 *   float       — число з конвертацією одиниць під суфікс атрибута (л↔мл, кг↔г,
 *                 год↔хв; л/мл↔кг/г — перехресно зі щільністю 1, бо Епіцентр
 *                 вимагає обидва поля, а фасування відоме в одному)
 *   text        — рядок як є
 *   select      — одне значення зі словника (аліас → точний збіг → входження → стем)
 *   multiselect — кілька значень (наш рядок ділимо по «;» і «,»)
 *   array       — Епіцентр не документує формат, пропускаємо
 * Якщо пряме зіставлення не дало нічого — правила за ключовими словами і дефолти
 * категорій (lib/epicentr-attribute-rules). Атрибути з відкритим словником
 * (unbounded) не мапимо.
 *
 * Чистий модуль: без БД, без fetch — покривається тестами й звітом
 * scripts/epicentr-attributes-report.mts.
 */
import data from './data/epicentr-attributes.json';
import { RULES, DEFAULTS } from './epicentr-attribute-rules';

export type EpiOption = { code: string; ua: string };
export type EpiAttribute = {
  code: string; type: string; required: boolean; system: boolean; title: string; suffix: string;
  options?: EpiOption[]; unbounded?: boolean;
};
export type EpiAttributeSet = { code: string; title: string; attributes: EpiAttribute[] };

const SETS = new Map<string, EpiAttributeSet>((data as { sets: EpiAttributeSet[] }).sets.map(s => [s.code, s]));

export function getEpicentrAttributeSet(code: string | null | undefined): EpiAttributeSet | undefined {
  return code ? SETS.get(String(code)) : undefined;
}

export type EpiProductInput = {
  name: string;
  /** для правил за ключовими словами (у фід як текст не йде) */
  description?: string | null;
  volume?: string | null;
  color?: string | null;
  characteristics?: { label: string; value: string }[] | null;
};

export type EpiParam = {
  code: string; title: string; type: string;
  /** для select/multiselect — коди опцій через кому */
  valuecode?: string;
  /** людський текст (значення опцій через «, », число або текст) */
  value: string;
};

export type EpiMapResult = {
  params: EpiParam[];
  /** обов'язкові атрибути, для яких не знайшли значення */
  missingRequired: { code: string; title: string; type: string }[];
  /** для звіту: атрибут ← сирі значення, які не зіставились зі словником */
  unmatched: { code: string; title: string; raw: string }[];
};

/* ── нормалізація ───────────────────────────────────────────────────────── */

export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/ґ/g, 'г').replace(/[ʼ’`´]/g, "'").replace(/ё/g, 'е')
    .replace(/&#0?39;/g, "'")
    .replace(/[()[\]«»"]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!]+$/g, '')
    .trim();
}

const num = (s: string): number | null => {
  const m = s.replace(/\s/g, '').match(/-?\d+(?:[.,]\d+)?/);
  return m ? parseFloat(m[0].replace(',', '.')) : null;
};

/** Ділимо мультизначення: «;» завжди, «,» — лише якщо частини не схожі на речення */
function splitMulti(v: string): string[] {
  const bySemi = v.split(';').map(s => s.trim()).filter(Boolean);
  const parts = bySemi.flatMap(p => (p.length > 60 ? [p] : p.split(',').map(s => s.trim()).filter(Boolean)));
  return [...new Set(parts)];
}

/* ── підбір опції словника ──────────────────────────────────────────────── */

function stem(w: string): string {
  // грубий стем для прикметникових форм: акрилова/акриловий/акрил → акрил
  return w.replace(/(ова|овий|ове|ові|ний|на|не|ні|ий|ій|а|е|і|и|у|ю|ь)$/u, '');
}

function escapeRx(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function matchOption(raw: string, options: EpiOption[]): EpiOption | null {
  const v = norm(raw);
  if (!v) return null;
  const exact = options.find(o => norm(o.ua) === v);
  if (exact) return exact;
  // опція входить у значення (довша опція точніша)
  const contained = options
    .filter(o => { const n = norm(o.ua); return n.length >= 4 && new RegExp(`(^|[^а-яїієa-z0-9])${escapeRx(n)}($|[^а-яїієa-z0-9])`, 'i').test(v); })
    .sort((a, b) => b.ua.length - a.ua.length);
  if (contained[0]) return contained[0];
  // значення входить в опцію (коротша опція точніша)
  const covering = options
    .filter(o => v.length >= 4 && norm(o.ua).includes(v))
    .sort((a, b) => a.ua.length - b.ua.length);
  if (covering[0]) return covering[0];
  // стеми першого слова
  const vs = stem(v.split(' ')[0]);
  if (vs.length >= 4) {
    const st = options.filter(o => stem(norm(o.ua).split(' ')[0]) === vs && norm(o.ua).split(' ').length === 1);
    if (st.length === 1) return st[0];
  }
  return null;
}

/** Опція за точною назвою або за префіксом (`^чорн`). */
function optionByName(name: string, options: EpiOption[]): EpiOption | null {
  if (name.startsWith('^')) { const p = norm(name.slice(1)); return options.find(o => norm(o.ua).startsWith(p)) ?? null; }
  const n = norm(name);
  return options.find(o => norm(o.ua) === n) ?? null;
}

/* ── джерела значень ────────────────────────────────────────────────────── */

type Chars = Map<string, string>;
type Source = (p: EpiProductInput, chars: Chars) => (string | null)[];
const fromChar = (...labels: string[]): Source => (_p, chars) => labels.map(l => chars.get(norm(l)) ?? null);
const fromVolume: Source = p => [p.volume ?? null];
const fromColor: Source = (p, chars) => [p.color ?? null, chars.get('колір') ?? null];
const tempRange = (minL: string, maxL: string, ...alts: string[]): Source => (_p, c) => [
  range(c.get(minL), c.get(maxL)), ...alts.map(a => c.get(a) ?? null),
];
/** «6×11,3 мм» → перше/друге число (скоби: висота×ширина) */
const dimPart = (label: string, idx: 0 | 1): Source => (_p, c) => {
  const m = (c.get(norm(label)) ?? '').match(/(\d+(?:[.,]\d+)?)\s*[x×х]\s*(\d+(?:[.,]\d+)?)/i);
  return [m ? `${m[idx + 1]} мм` : null];
};
const qtyFromName: Source = p => { const m = p.name.match(/(\d+)\s*шт/i); return [m ? m[1] : null]; };

/**
 * Синоніми: назва атрибута Епіцентру (норм.) → джерела в нас, по черзі до першого
 * збігу зі словником. Ключ може бути `код набору:назва` для набір-специфічних.
 */
const SOURCES: Record<string, Source[]> = {
  "об'єм":                      [fromVolume, fromChar("Об'єм", 'Фасування')],
  'вага':                       [fromChar('Вага нетто', 'Вага', 'Фасування'), fromVolume],
  'фасування':                  [fromVolume, fromChar('Фасування', "Об'єм")],
  'базовий колір':              [fromColor],
  'колір':                      [fromColor],
  'ступінь блиску':             [fromChar('Ступінь блиску')],
  'розчинник':                  [fromChar('Розчинник', 'Основа')],
  'основа':                     [fromChar('Основа', 'Матеріал', 'Тип')],
  "основа зв'язуючої речовини": [fromChar('Основа')],
  "основа (зв'язуюча речовина)": [fromChar('Основа')],
  'сфера застосування':         [fromChar('Тип використання', 'Тип використання приміщень', 'Область застосування', 'Призначення')],
  'загальне призначення':       [fromChar('Тип використання')],
  'застосування':               [fromChar('Тип використання', 'Область застосування')],
  'тип приміщення':             [fromChar('Тип використання')],
  'призначення':                [fromChar('Тип використання', 'Призначення', 'Поверхня', 'Склеювані матеріали', 'Область застосування')],
  'призначення клею':           [fromChar('Призначення', 'Тип клею', 'Склеювані матеріали')],
  'призначення засобу':         [fromChar('Призначення', 'Склеювані матеріали', 'Область застосування')],
  'призначення мастики':        [fromChar('Призначення', 'Область застосування')],
  'призначення стрічки':        [fromChar('Призначення', 'Область застосування')],
  'призначення піни':           [fromChar('Призначення', 'Область застосування')],
  'призначення круга':          [fromChar('Тип різання', 'Призначення', 'Матеріал')],
  'призначення скоби':          [fromChar('Призначення', 'Область застосування')],
  'компонентність':             [fromChar('Кількість компонентів')],
  'кількість компонентів':      [fromChar('Кількість компонентів')],
  'упаковка':                   [fromChar('Форма випуску', 'Упаковка', 'Тип балона')],
  'готовність до застосування': [fromChar('Форма', 'Стан', 'Консистенція')],
  'консистенція':               [fromChar('Консистенція', 'Стан')],
  'тип':                        [fromChar('Тип', 'Тип клею', 'Спосіб випуску з балона', 'Тип скоби', 'Тип інструменту')],
  'вид':                        [fromChar('Тип', 'Вид', 'Форма профілю')],
  'вид піни':                   [fromChar('Спосіб випуску з балона', 'Тип')],
  'вид лака':                   [fromChar('Тип')],
  'тип шпаклівки':              [fromChar('Тип')],
  'тип клею':                   [fromChar('Тип клею', 'Тип', 'Форма')],
  'сезонність':                 [fromChar('Сезон')],
  'клас водостійкості':         [fromChar('Клас водостійкості', 'Водостійкість')],
  'вологостійкість':            [fromChar('Водостійкість', 'Клас водостійкості')],
  'вологостійка':               [fromChar('Водостійкість')],
  'водостійкість':              [fromChar('Водостійкість')],
  'наявність індикатора':       [fromChar('Наявність індикатора')],
  'термін придатності':         [fromChar('Термін придатності')],
  'час повного висихання':      [fromChar('Час повного затвердіння', 'Час висихання')],
  'час висихання до відлипання': [fromChar('Час висихання поверхні')],
  'час висихання':              [fromChar('Час висихання', 'Час повного затвердіння')],
  'час склеювання':             [fromChar('Час початкового схоплення', 'Час первинного схоплення', 'Час повного затвердіння', 'Час висихання')],
  'час тужавіння':              [fromChar('Час початкового схоплення')],
  'витрата':                    [fromChar('Витрата матеріалу')],
  'витрата з однієї упаковки':  [fromChar('Площа обробки', 'Покриття', 'Витрата матеріалу')],
  'температура застосування':   [tempRange('мінімальна температура застосування', 'максимальна температура застосування', 'температура нанесення')],
  'температура нанесення':      [tempRange('мінімальна температура застосування', 'максимальна температура застосування', 'температура нанесення')],
  'мін.температура нанесення':  [fromChar('Мінімальна температура застосування')],
  'макс. температура нанесення': [fromChar('Максимальна температура застосування')],
  'температура експлуатації':   [tempRange('мінімальна температура експлуатації', 'максимальна температура експлуатації', 'температурний діапазон експлуатації', 'температура експлуатації', 'діапазон температур експлуатації')],
  'робоча температура експлуатації': [tempRange('мінімальна температура експлуатації', 'максимальна температура експлуатації', 'температура експлуатації')],
  'ширина':                     [fromChar('Ширина', 'Ширина профілю', 'Робоча ширина')],
  'довжина':                    [fromChar('Довжина', 'Довжина рулону')],
  'товщина':                    [fromChar('Товщина', 'Товщина профілю')],
  'діаметр':                    [fromChar('Діаметр', 'Діаметр електрода')],
  'зовнішній діаметр':          [fromChar('Діаметр')],
  'діаметр посадочний':         [fromChar('Посадковий отвір')],
  'товщина круга':              [fromChar('Товщина')],
  'щільність':                  [fromChar('Щільність')],
  'зернистість':                [fromChar('Зернистість')],
  'кількість':                  [fromChar('Кількість у наборі', 'Кількість в упаковці'), qtyFromName],
  'кількість в упаковці':       [fromChar('Кількість в упаковці', 'Кількість у наборі'), qtyFromName],
  'кількість у наборі':         [fromChar('Кількість у наборі', 'Кількість в упаковці'), qtyFromName],
  'матеріал':                   [fromChar('Матеріал', 'Основа', 'Матеріал корпусу')],
  'матеріал корпусу':           [fromChar('Матеріал корпусу', 'Матеріал каркасу')],
  'матеріал ворсу':             [fromChar('Матеріал ворсу')],
  'тип головки':                [fromChar('Тип голівки')],
  'тип накінечника':            [fromChar('Тип наконечника')],
  'тип хвостовика':             [fromChar('Тип хвостовика')],
  'покриття':                   [fromChar('Покриття')],
  'особливості':                [fromChar('Особливості', 'Ефект')],
  'запах':                      [fromChar('Запах', 'Без запаху')],
  'максимальна ширина шва, мм': [fromChar('Ширина шва')],
  'ширина шва':                 [fromChar('Ширина шва')],
  'наявність клейової основи':  [fromChar('Основа кріплення', 'Клейких сторін')],
  "об`єм виходу піни":          [fromChar('Вихід піни')],
  'коефіцієнт розширення':      [fromChar('Первинне розширення')],
  'склад':                      [fromChar('Склад')],
  'сумісність':                 [fromChar('Сумісність', 'Сумісність з основами')],
  'комплектація':               [fromChar('Комплектація')],
  'додаткові характеристики':   [fromChar('Конструкція', 'Ефект')],
  'умови зберігання':           [fromChar('Умови зберігання')],
  'тип електрода':              [fromChar('Тип електрода', 'Тип покриття')],
  'вид струму':                 [fromChar('Рід струму')],
  'зварювальний матеріал':      [fromChar('Матеріал', 'Призначення')],
  'модель':                     [fromChar('Модель')],
  'захисні властивості':        [fromChar('Захист від', 'Ефект', 'Особливості')],
  'тип скоби, цвяха':           [fromChar('Тип скоби')],
  '2599:висота':                [dimPart('Розміри', 0)],
  // Клей для шпалер: витрата з пачки ≈ г/8 (Metylan: 200 г → 25 м²), коли виробник не вказав
  '3216:витрата з однієї упаковки': [fromChar('Покриття', 'Площа обробки'), (p) => { const g = toUnit(p.volume ?? '', 'г', ''); return [g ? `${Math.round(g / 8)} кв. м` : null]; }],
  'відтінок':                   [fromColor],
  '2599:ширина':                [dimPart('Розміри', 1), fromChar('Ширина')],
};

function range(min: string | null | undefined, max: string | null | undefined): string | null {
  const a = min ? num(min) : null, b = max ? num(max) : null;
  if (a == null && b == null) return null;
  const f = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  if (a != null && b != null) return `від ${f(a)} до ${f(b)} °C`;
  return a != null ? `від ${f(a)} °C` : `до ${f(b!)} °C`;
}

/* ── спеціальні відповідності значень ───────────────────────────────────── */

/** Наш колір → базові кольори Епіцентру (може бути кілька). */
const COLOR_WORDS: [RegExp, string[]][] = [
  [/безбарвн|прозор/i, ['прозорий']],
  [/біл|жасмін/i, ['білий']], [/чорн|антрацит|графіт/i, ['чорний']], [/сір|сталев|срібл|платин/i, ['сірий']],
  [/червон|бордо|вишн|терракот|теракот/i, ['червоний']], [/помаранч|оранж|персик/i, ['помаранчевий']],
  [/жовт|лимон|золот|охра/i, ['жовтий']], [/зелен|салат|оливк|хакі|фісташ|м'ят|смарагд|нефрит|нефріт|ківі/i, ['зелений']],
  [/син|ультрамарин|індиго/i, ['синій']], [/блакит|голуб|бірюз/i, ['блакитний']],
  [/фіолет|бузк|лаванд|пурпур/i, ['фіолетовий']], [/рожев/i, ['рожевий']],
  [/беж|пісоч|слонов|крем|ваніл|багама|карамел|нюд|сахар|натур/i, ['бежевий']],
  [/коричн|горіх|шокол|махагон|дуб|тік|каштан|палісандр|венге|бронз|мідн|кав|какао|сосн|вільх|бук|кедр|ясен|модрин|акац|клінкер|сієн/i, ['коричневий']],
];

function baseColors(raw: string, options: EpiOption[]): EpiOption[] {
  const hits: EpiOption[] = [];
  for (const [rx, names] of COLOR_WORDS) {
    if (!rx.test(raw)) continue;
    for (const n of names) { const o = options.find(x => norm(x.ua) === n); if (o && !hits.includes(o)) hits.push(o); }
  }
  return hits;
}

const VALUE_ALIASES: Record<string, string[]> = {
  'глянцевий': ['глянець', 'глянцевий'], 'матовий': ['мат', 'матовий'], 'напівматовий': ['напівмат'], 'напівглянцевий': ['напівглянець'],
  'шовковисто-матовий': ['шовковистий мат'], 'шовковисто-глянцевий': ['шовковистий глянець'],
  'концентрат': ['концентрат'], 'готова до застосування': ['готово до застосування', 'готовий до застосування'],
  'готовий до застосування': ['готово до застосування'], 'суха суміш': ['потребує приготування', 'сухий'],
  'паста': ['паста', 'пастоподібна', 'пастоподібний'], 'рідкий': ['рідка', 'рідкий'], 'гель': ['гель', 'гелеподібна'],
  'внутрішні роботи': ['для внутрішніх робіт', 'для внутрішніх приміщень', 'внутрішні роботи'],
  'зовнішні роботи': ['для зовнішніх робіт', 'зовнішні роботи'],
  'внутрішні та зовнішні роботи': ['для внутрішніх і зовнішніх робіт', 'для внутрішніх та зовнішніх робіт', 'універсальна', 'універсальний'],
  'всесезонна': ['всесезонна', 'всесезонний', 'всесезонне'], 'зимова': ['зимова', 'зимовий'], 'літня': ['літня', 'літній'],
  'так': ['так', 'є'], 'ні': ['ні', 'немає'],
  'однокомпонентний': ['однокомпонентний'], 'двокомпонентний': ['двокомпонентний'],
  'акриловий': ['акрил', 'акриловий', 'на основі акрилових полімерів'], 'акрилова': ['акрил', 'акрилова', 'на основі акрилових полімерів'],
  'силіконова': ['силікон', 'силіконова', 'на силіконовій основі'], 'силіконовий': ['силікон'],
  'бітумна': ['бітум', 'бітумна'], 'бітумний': ['бітум'], 'поліуретанова': ['поліуретан'], 'поліуретановий': ['поліуретан'],
  'силікатний': ['силікат', 'силікатна'], 'цементна': ['на цементній основі', 'цемент'], 'епоксидна': ['на основі епоксидної смоли', 'епоксидна'],
  'пва': ['пва', 'полівінілацетатна', 'полівінілацетатна дисперсія'], 'уайт-спірит': ['уайт-спірит'], 'вода': ['вода'],
  'під пістолет': ['професійна', 'пістолетна'], 'трубка-адаптер': ['під трубочку', 'побутова'],
  'потайна': ['потайна', 'потай'], 'напівкругла': ['напівкругла'], 'напівциліндрична': ['напівкругла'], 'гексагональна': ['шестигранна'],
  'водостійкий': ['водостійкий', 'd3'], 'сталь': ['метал', 'сталь'], 'алюміній': ['алюміній'],
};

function optionByAlias(raw: string, options: EpiOption[]): EpiOption | null {
  const aliases = VALUE_ALIASES[norm(raw)];
  if (!aliases) return null;
  for (const a of aliases) { const o = options.find(x => norm(x.ua) === norm(a)); if (o) return o; }
  return null;
}

/* ── конвертація чисел під суфікс атрибута ──────────────────────────────── */

export function toUnit(raw: string, suffix: string, title: string): number | null {
  const s = raw.toLowerCase().replace(/,/g, '.');
  const n = /максимальн/i.test(title) ? (s.match(/-?\d+(?:\.\d+)?/g)?.map(Number).sort((a, b) => b - a)[0] ?? null) : num(raw);
  if (n == null) return null;
  const sfx = norm(suffix);
  const has = (rx: RegExp) => rx.test(s);
  const isMl = has(/мл/), isL = !isMl && has(/(^|[^а-яa-z])л(?![а-яa-z])/), isKg = has(/кг/), isG = !isKg && has(/(^|[^а-яa-z])г(?![а-яa-z])/);
  if (sfx === 'л')  return isMl ? n / 1000 : isL ? n : isKg ? n : isG ? n / 1000 : null;
  if (sfx === 'мл') return isMl ? n : isL ? n * 1000 : isKg ? n * 1000 : isG ? n : null;
  if (sfx === 'кг') return isKg ? n : isG ? n / 1000 : isL ? n : isMl ? n / 1000 : null;
  if (sfx === 'г')  return isKg ? n * 1000 : isG ? n : isMl ? n : isL ? n * 1000 : null;
  if (sfx === 'год') return has(/хв/) ? n / 60 : has(/діб|дн|доб/) ? n * 24 : has(/сек/) ? n / 3600 : n;
  if (sfx === 'хв') return has(/год/) ? n * 60 : has(/сек/) ? n / 60 : n;
  if (sfx === 'мм') return has(/(^|[^а-яa-z])см/) ? n * 10 : has(/(^|[^а-яa-z])м(?![а-яa-z])/) && !has(/мм/) ? n * 1000 : n;
  if (sfx === 'см') return has(/мм/) ? n / 10 : has(/(^|[^а-яa-z])м(?![а-яa-z])/) && !has(/см/) ? n * 100 : n;
  if (sfx === 'м')  return has(/мм/) ? n / 1000 : has(/(^|[^а-яa-z])см/) ? n / 100 : n;
  if (/міс/.test(sfx)) return has(/рок|рік/) ? n * 12 : n;
  return n;
}

/** Словники на кшталт «Об'єм {2 | 0,75}» / «Вага {2,7 кг}» — збіг за числом і одиницею. */
function numericOption(raw: string, options: EpiOption[]): EpiOption | null {
  const n = num(raw);
  if (n == null) return null;
  const unit = (raw.match(/(кг|мл|г|л|мм|см|м)(?![а-яa-z])/i)?.[1] ?? '').toLowerCase();
  const cands = options.filter(o => {
    const on = num(o.ua); if (on == null || Math.abs(on - n) > 1e-9) return false;
    const ou = (o.ua.match(/(кг|мл|г|л|мм|см|м)(?![а-яa-z])/i)?.[1] ?? '').toLowerCase();
    return !ou || !unit || ou === unit;
  });
  return cands[0] ?? null;
}

/* ── головна функція ────────────────────────────────────────────────────── */

const SKIP_SYSTEM = new Set(['brand', 'country_of_origin', 'measure', 'ratio', 'weight', 'width', 'height', 'length', 'barcodes']);
const HAY_LABELS = ['Тип', 'Призначення', 'Особливості', 'Основа', 'Матеріал', 'Тип клею', 'Область застосування', 'Спосіб випуску з балана', 'Спосіб випуску з балона', 'Сезон', 'Покриття', 'Тип різання', 'Розчинник', 'Склеювані матеріали', 'Поверхня', 'Ефект', 'Захист від', 'Форма', 'Стан', 'Форма випуску', 'Водостійкість', 'Серія', 'Тип голівки', 'Клейких сторін', 'Основа кріплення', 'Тип скоби'];

const inSet = (rule: { set?: string | string[] }, code: string) =>
  !rule.set || (Array.isArray(rule.set) ? rule.set.includes(code) : rule.set === code);

function selectHits(a: EpiAttribute, raw: string, opts: EpiOption[], title: string): EpiOption[] {
  let hits: EpiOption[] = [];
  if (title === 'базовий колір' || title === 'колір') hits = baseColors(raw, opts);
  if (!hits.length && a.type === 'multiselect') {
    for (const part of splitMulti(raw)) {
      const o = optionByAlias(part, opts) ?? matchOption(part, opts);
      if (o && !hits.includes(o)) hits.push(o);
      if (!o && /внутрішн/i.test(part) && /зовнішн/i.test(part)) {
        for (const k of ['для внутрішніх робіт', 'для зовнішніх робіт']) { const x = opts.find(y => norm(y.ua) === k); if (x && !hits.includes(x)) hits.push(x); }
      }
    }
  }
  if (!hits.length && a.type === 'select') {
    const o = optionByAlias(raw, opts) ?? matchOption(raw, opts) ?? matchOption(splitMulti(raw)[0] ?? raw, opts) ?? numericOption(raw, opts);
    if (o) hits = [o];
  }
  if (!hits.length && a.type === 'multiselect') { const o = numericOption(raw, opts); if (o) hits = [o]; }
  return hits;
}

export function mapEpicentrAttributes(setCode: string | null | undefined, p: EpiProductInput): EpiMapResult {
  const set = getEpicentrAttributeSet(setCode);
  const res: EpiMapResult = { params: [], missingRequired: [], unmatched: [] };
  if (!set) return res;
  const code = set.code;

  const chars: Chars = new Map();
  for (const c of p.characteristics ?? []) if (c.label && c.value) chars.set(norm(c.label), c.value.trim());
  // «стіг» для правил за ключовими словами: назва + характерні поля
  const hay = [p.name, ...HAY_LABELS.map(l => chars.get(norm(l)) ?? ''), p.volume ?? '', (p.description ?? '').slice(0, 600)].join(' ; ');

  for (const a of set.attributes) {
    if (a.system || SKIP_SYSTEM.has(a.code) || a.unbounded || a.type === 'array') continue;
    const title = norm(a.title);
    const sources = SOURCES[`${code}:${title}`] ?? SOURCES[title] ?? [fromChar(a.title)];
    const raws = sources.flatMap(s => s(p, chars)).filter((r): r is string => !!r);
    const opts = a.options ?? [];
    let param: EpiParam | null = null;
    let lastRaw: string | null = null;

    for (const raw of raws) {
      lastRaw = raw;
      if (a.type === 'float') {
        const n = toUnit(raw, a.suffix, a.title);
        if (n != null && Number.isFinite(n) && n > 0) { param = { code: a.code, title: a.title, type: a.type, value: String(Math.round(n * 1000) / 1000) }; break; }
      } else if (a.type === 'text') {
        param = { code: a.code, title: a.title, type: a.type, value: raw.slice(0, 500) }; break;
      } else {
        const hits = selectHits(a, raw, opts, title);
        if (hits.length) { param = { code: a.code, title: a.title, type: a.type, valuecode: hits.map(h => h.code).join(','), value: hits.map(h => h.ua).join(', ') }; break; }
      }
    }

    // Правила за ключовими словами (select/multiselect) — доповнюють multiselect, закривають select
    if ((a.type === 'select' || a.type === 'multiselect') && opts.length) {
      const hits: EpiOption[] = [];
      for (const r of RULES) {
        if (r.attr !== title || !inSet(r, code) || !r.rx.test(hay)) continue;
        for (const name of Array.isArray(r.opt) ? r.opt : [r.opt]) {
          const o = optionByName(name, opts); if (o && !hits.includes(o)) hits.push(o);
        }
        if (a.type === 'select' && hits.length) break;
      }
      if (hits.length) {
        if (a.type === 'multiselect' && param) {
          const have = new Set(param.valuecode!.split(','));
          const add = hits.filter(h => !have.has(h.code));
          if (add.length) { param.valuecode += ',' + add.map(h => h.code).join(','); param.value += ', ' + add.map(h => h.ua).join(', '); }
        } else if (!param) {
          param = { code: a.code, title: a.title, type: a.type, valuecode: hits.map(h => h.code).join(','), value: hits.map(h => h.ua).join(', ') };
        }
      }
    }

    // Дефолт категорії
    if (!param) {
      const d = DEFAULTS.find(x => x.attr === title && inSet(x, code));
      if (d?.value && (a.type === 'float' || a.type === 'text')) param = { code: a.code, title: a.title, type: a.type, value: d.value };
      else if (d?.opt && opts.length) {
        const hits = (Array.isArray(d.opt) ? d.opt : [d.opt]).map(n => optionByName(n, opts)).filter((o): o is EpiOption => !!o);
        if (hits.length) param = { code: a.code, title: a.title, type: a.type, valuecode: hits.map(h => h.code).join(','), value: hits.map(h => h.ua).join(', ') };
      }
    }

    if (param) res.params.push(param);
    else {
      if (lastRaw && (a.type === 'select' || a.type === 'multiselect')) res.unmatched.push({ code: a.code, title: a.title, raw: lastRaw });
      if (a.required) res.missingRequired.push({ code: a.code, title: a.title, type: a.type });
    }
  }
  return res;
}
