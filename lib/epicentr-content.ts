/**
 * Контент картки для Епіцентру — чисті функції під «Загальні вимоги до контенту»
 * (supportm.epicentrk.ua/zagalnivymogydokontentu) і «Вимоги до візуального контенту».
 *
 * Назва:  Тип + Особливість + Бренд + Модель + Інші характеристики + Колір (Артикул),
 *         ≤150 символів, без ком/крапок/двокрапок, без КАПСУ, без «Акція/Знижка».
 * Опис:   лише «Опис (UA)», ≤1500 символів (рекомендовано ~1000), дозволені теги
 *         p, b, ul, li, table, tr, td; без знаків оклику, посилань, контактів,
 *         умов доставки/оплати. Назва товару в описі — не більше одного разу
 *         (це не контролюємо: MP-опис і так пише її лише у першому реченні).
 * Фото:   мін. 500×500, рекомендовано 1280×1280, без вотермарок/написів, до 10 шт.
 * Пакування: вага в грамах обов'язкова для розрахунку доставки.
 */
import { formatForRozetka } from './rozetka-name';

export const EPICENTR_NAME_MAX = 150;
export const EPICENTR_DESC_MAX = 1500;

/**
 * Бренди для Епіцентру, яких немає в їхньому довіднику (звіт імпорту 12.09.2026):
 *   • заміна — бренд показуємо під іншим (рішення власника: Tangit → Ceresit);
 *   • виключення — товари не йдуть ні у фід, ні в пуш цін/наявності.
 * Лише для Епіцентру: у БД, на сайті й на інших площадках бренд лишається як є.
 */
const EPICENTR_BRAND_OVERRIDE: Record<string, string> = {
  Tangit: 'Ceresit',
};
const EPICENTR_EXCLUDED_BRANDS = new Set(['Хімконтакт', 'Spitce', 'HARDEX', 'ПОЛЯРА-ХИМ']);

/** Бренд товару для Епіцентру; null — товар на Епіцентр не йде. */
export function epicentrBrand(brand: string | null | undefined): string | null {
  const b = (brand ?? '').trim();
  if (EPICENTR_EXCLUDED_BRANDS.has(b)) return null;
  return EPICENTR_BRAND_OVERRIDE[b] ?? b;
}

/**
 * Форматер дописує колір у кінець, навіть коли він уже є в назві іншою формою
 * («темно зелена 2.7 кг Темно-зелений»). Прибираємо хвіст, якщо кожне слово кольору
 * (за основою з 4 літер) уже трапляється раніше.
 */
function dropTrailingColorDup(name: string, color: string | null | undefined): string {
  const c = (color ?? '').trim();
  if (!c || !name.endsWith(c)) return name;
  const head = name.slice(0, -c.length).toLowerCase();
  const stems = c.toLowerCase().split(/[\s\-/]+/).filter(w => w.length >= 3).map(w => w.slice(0, 4));
  return stems.length && stems.every(s => head.includes(s)) ? name.slice(0, -c.length).trim() : name;
}

/** Назва за шаблоном Епіцентру; артикул у дужках — частина їхнього шаблону. */
export function epicentrName(p: { sku: string; name: string; rozetka_name?: string | null; brand?: string | null; volume?: string | null; color?: string | null }): string {
  // Десяткові коми → крапки ДО форматування: cleanCommas у formatForRozetka інакше
  // розірве «6,0» на «6 0». Але саме фасування лишаємо в оригінальному вигляді:
  // форматер шукає його в назві за значенням volume, і якщо не знайде — допише ще
  // раз («ExtraLatex 1.4 кг 1.4 кг», звіт кабінету 12.09.2026).
  const VOL = '⟦VOL⟧';
  const vol = p.volume?.trim() || '';
  const protectedName = vol && p.name.includes(vol)
    ? p.name.split(vol).map(part => part.replace(/(\d),(\d)/g, '$1.$2')).join(VOL).replace(new RegExp(VOL, 'g'), vol)
    : p.name.replace(/(\d),(\d)/g, '$1.$2');
  let base = (p.rozetka_name?.trim() || dropTrailingColorDup(formatForRozetka(protectedName, p.brand, p.volume, p.color), p.color))
    // розділові знаки в назві заборонені (крім тих, що всередині моделі — їх не відрізнити, тож
    // прибираємо лише коми, крапки з комою, двокрапки і кінцеві крапки)
    .replace(/(\d),(\d)/g, '$1.$2')   // десятковий роздільник — крапка, як у Rozetka
    .replace(/[;:]/g, ' ')
    .replace(/,\s*/g, ' ')
    .replace(/\.\s*$/, '')
    // «x» між розмірами — маленька кирилична «х», одиниці через пробіл: 125х22 мм
    .replace(/(\d)\s*[xX×]\s*(\d)/g, '$1х$2')
    .replace(/\s+/g, ' ')
    .trim();
  // Слова-стопери
  // \b у JS не працює з кирилицею — межі слова через пробіли
  base = base.replace(/(^|\s)(акція|знижка|розпродаж|уцінка|original)(?=\s|$)/gi, '$1').replace(/\s+/g, ' ').trim();
  const tail = ` (${p.sku})`;
  if (base.length + tail.length > EPICENTR_NAME_MAX) base = base.slice(0, EPICENTR_NAME_MAX - tail.length).trim();
  return base + tail;
}

const ALLOWED_TAGS = new Set(['p', 'b', 'ul', 'li', 'table', 'tr', 'td']);

/**
 * Опис під правила Епіцентру: лишаємо дозволені теги, strong→b, h2/h3/div→p,
 * посилання — лише текст, знаки оклику → крапки, обрізаємо до ліміту по межі речення.
 */
export function epicentrDescription(html: string | null | undefined): string {
  if (!html) return '';
  const s = html
    .replace(/\r/g, '')
    .replace(/<\s*(strong|em)\b[^>]*>/gi, '<b>').replace(/<\/\s*(strong|em)\s*>/gi, '</b>')
    .replace(/<\s*(h[1-6]|div|section)\b[^>]*>/gi, '<p>').replace(/<\/\s*(h[1-6]|div|section)\s*>/gi, '</p>')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\s*ol\b[^>]*>/gi, '<ul>').replace(/<\/\s*ol\s*>/gi, '</ul>')
    // будь-який інший тег — геть, текст лишається (у т.ч. <a>)
    .replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (m, tag: string) => {
      const t = tag.toLowerCase();
      if (!ALLOWED_TAGS.has(t)) return '';
      return m.startsWith('</') ? `</${t}>` : `<${t}>`;   // атрибути прибираємо
    })
    .replace(/https?:\/\/[^\s<]+/gi, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/!+/g, '.')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();

  if (s.length <= EPICENTR_DESC_MAX) return s;
  // Обрізаємо по кінцю речення/абзацу, щоб не лишити відкритий тег усередині слова
  const cut = s.slice(0, EPICENTR_DESC_MAX);
  const at = Math.max(cut.lastIndexOf('</p>'), cut.lastIndexOf('. '), cut.lastIndexOf('.\n'));
  let out = at > EPICENTR_DESC_MAX * 0.5 ? cut.slice(0, at + (cut.startsWith('</p>', at) ? 4 : 1)) : cut;
  // Закриваємо незакриті p/ul/li, якщо відрізали всередині
  for (const t of ['li', 'ul', 'p']) {
    const opens = (out.match(new RegExp(`<${t}>`, 'g')) ?? []).length;
    const closes = (out.match(new RegExp(`</${t}>`, 'g')) ?? []).length;
    if (opens > closes) out += `</${t}>`.repeat(opens - closes);
  }
  return out.trim();
}

/** Щільність для оцінки ваги з об'єму (кг/л): будхімія переважно важча за воду. */
const DENSITY_BY_HINT: { rx: RegExp; d: number }[] = [
  { rx: /піна|очисник|розчинник|антисепт|антигриб|просоч|морил|концентрат|засіб/i, d: 1.0 },
  { rx: /ґрунт|грунт|лак|лазур|колорант/i, d: 1.1 },
  { rx: /емаль|фарба|бетоноконтакт|мастика|праймер/i, d: 1.35 },
  { rx: /герметик|клей|шпакл/i, d: 1.3 },
];

/**
 * Вага брутто в грамах для параметрів пакування. Джерела за пріоритетом:
 * характеристика «Вага упаковки»/«Вага», фасування у кг/г, об'єм у л/мл × щільність (оцінка).
 * Тара додається як ~5 %. null — коли нема з чого оцінити.
 */
export function epicentrWeightGrams(p: { name: string; volume?: string | null; characteristics?: { label: string; value: string }[] | null }): number | null {
  const num = (s: string) => parseFloat(s.replace(',', '.'));
  // «Вага упаковки» заповнена у 676 товарів, «Вага» — у 76, «Вага нетто» — у 10
  const chars = p.characteristics ?? [];
  const w = ['Вага упаковки', 'Вага брутто', 'Вага', 'Вага нетто'].map(l => chars.find(c => c.label === l)?.value).find(Boolean) ?? '';
  let m = w.match(/(\d+(?:[.,]\d+)?)\s*кг/i);
  if (m) return Math.round(num(m[1]) * 1000 * 1.05);
  m = w.match(/(\d+(?:[.,]\d+)?)\s*г(?![а-яіїє])/i);
  if (m) return Math.round(num(m[1]) * 1.05);

  const v = p.volume ?? '';
  m = v.match(/(\d+(?:[.,]\d+)?)\s*кг/i);
  if (m) return Math.round(num(m[1]) * 1000 * 1.05);
  m = v.match(/(\d+(?:[.,]\d+)?)\s*г(?![а-яіїє])/i);
  if (m) return Math.round(num(m[1]) * 1.05);

  const density = DENSITY_BY_HINT.find(h => h.rx.test(p.name))?.d ?? 1.2;
  m = v.match(/(\d+(?:[.,]\d+)?)\s*мл/i);
  if (m) return Math.round(num(m[1]) * density * 1.05);
  m = v.match(/(\d+(?:[.,]\d+)?)\s*л(?![а-яіїє])/i);
  if (m) return Math.round(num(m[1]) * 1000 * density * 1.05);
  return null;
}
