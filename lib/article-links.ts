import * as cheerio from 'cheerio';
import { getCategoryNameRu } from './ru';

/**
 * Контекстні посилання зі статті на категорії магазину — на рендері, а не в
 * HTML статті в БД.
 *
 * Навіщо. Статті блогу стоять на позиціях 4–8 і збирають 65 % кліків сайту,
 * а категорії з тими самими запитами — на 40–60. «Монтажная пена» (75 показів)
 * і «морилка для дерева» показують статтю, а не категорію. Статті посилались
 * на категорії лише кнопками в шапці й у блоці внизу — без ключового анкора в
 * тексті. Перше згадування назви категорії в тілі статті тепер стає
 * посиланням «клей для шпалер → /shop/klei-dlya-shpaler» — це і навігація
 * для читача, і передача ваги сторінці, яка має продавати.
 *
 * Чому на рендері. Правити content_html 32 статей двома мовами — разова
 * операція, яку не повторити для нової статті і не відкотити одним комітом.
 * Тут — одна функція, працює для обох мов (ru-назви з lib/ru) і для всіх
 * майбутніх статей автоматично; вимкнути — прибрати виклик.
 *
 * Правила, щоб не перетворити текст на «портянку посилань»:
 *  • лише посилання на /shop/… із related_links статті (ті, що власник обрав);
 *  • одна категорія — одне посилання, перше згадування в тексті абзаців;
 *  • не всередині наявних <a>, не в заголовках, не в таблицях;
 *  • не більше MAX_LINKS на статтю.
 *
 * Точність важливіша за повноту: перша версія з м'якими стемами чіпляла
 * «відрізняються» до «Відрізних дисків», «полімеризування» до MS-полімерів і
 * «Бітумна» без «праймери» до праймерів. Тому: усі значущі слова назви
 * обов'язкові й у тому ж порядку, закінчення — не довші за 1–2 літери,
 * однослівні короткі назви («Клеї», «Піна», «Фарби») не лінкуються взагалі.
 */

const MAX_LINKS = 3;

export type ShopLink = { href: string; label: string };

type Node = Parameters<cheerio.CheerioAPI>[0];

const WORD_END = "[^\\s,.;:!?()«»\"']*";
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Слово → шаблон: стем без 1–2 останніх літер + стільки ж (+1) літер закінчення.
 *  «фарби» → фарб\p{L}{0,2}; «ґрунтовки» → ґрунтов\p{L}{0,3}. */
function wordPattern(w: string): string {
  const cut = w.length <= 5 ? 1 : 2;
  return `${esc(w.slice(0, w.length - cut))}\\p{L}{0,${cut + 1}}`;
}

/**
 * Шаблони назви категорії за спаданням суворості: повна назва (усі значущі
 * слова по порядку, між ними допускається одне коротке службове — «клей для
 * шпалер»), а для назв із довгим і однозначним першим словом (≥ 10 літер:
 * «Пластифікатори для бетону», «Гідроізоляційні мастики») — ще й саме перше
 * слово. Однослівні назви до 5 літер («Клеї», «Піна») — без шаблону.
 */
export function labelPatterns(label: string): RegExp[] {
  const words = label.toLowerCase().replace(/[’ʼ`]/g, "'").split(/[\s-]+/).filter(w => w.length >= 4 && /\p{L}/u.test(w));
  if (!words.length) return [];
  if (words.length === 1 && words[0].length <= 5) return [];
  // (?!\p{L}) — збіг закінчується на межі слова: «Герметики» ≠ «герметизуюча»
  const wrap = (body: string) => new RegExp(`(^|[^\\p{L}])(${body})(?!\\p{L})`, 'iu');
  const full = words.map(wordPattern).join(`[\\s-]+(?:\\S{1,3}[\\s-]+)?`);
  const out = [wrap(full)];
  if (words.length > 1 && words[0].length >= 10) out.push(wrap(wordPattern(words[0])));
  return out;
}

/** Перший шаблон (для тестів і сумісності). */
export function labelPattern(label: string): RegExp | null {
  return labelPatterns(label)[0] ?? null;
}

export function linkCategoriesInHtml(html: string, links: ShopLink[], lang: 'uk' | 'ru'): string {
  if (!html || !links.length) return html;
  const targets = links
    .filter(l => l.href.startsWith('/shop/'))
    .map(l => {
      const slug = l.href.slice('/shop/'.length);
      const label = lang === 'ru' ? getCategoryNameRu(slug, l.label) : l.label;
      return { href: l.href, res: labelPatterns(label) };
    })
    .filter(t => t.res.length);
  if (!targets.length) return html;

  const $ = cheerio.load(html, null, false);
  let linked = 0;
  const done = new Set<string>();

  // Одна заміна за прохід, після неї — свіжий обхід: replaceWith робить старі
  // текстові вузли недійсними, тож тримати їх список між замінами не можна.
  // Спершу суворі шаблони по всьому абзацу, потім м'якші — щоб «пластифікатор
  // для бетону» виграв у «пластифікатор», якщо є обидва.
  const tryLinkOnce = (el: Node): boolean => {
    const nodes: { node: Node; text: string }[] = [];
    $(el).find('*').addBack().contents().each((_, n) => {
      if (n.type === 'text' && !$(n).closest('a').length) nodes.push({ node: n, text: (n as { data?: string }).data ?? '' });
    });
    for (let tier = 0; tier < 2; tier++) {
      for (const { node, text } of nodes) {
        for (const t of targets) {
          if (done.has(t.href) || !t.res[tier]) continue;
          const m = t.res[tier].exec(text);
          if (!m) continue;
          const start = m.index + m[1].length;
          const word = m[2];
          $(node).replaceWith(`${escHtml(text.slice(0, start))}<a href="${t.href}">${escHtml(word)}</a>${escHtml(text.slice(start + word.length))}`);
          done.add(t.href);
          linked++;
          return true;
        }
      }
    }
    return false;
  };

  // Абзаци й пункти списків у порядку документа; заголовки, таблиці, цитати — ні
  $('p, li').each((_, el) => {
    if (linked >= MAX_LINKS) return false;
    if ($(el).closest('a, table, blockquote, h1, h2, h3').length) return;
    while (linked < MAX_LINKS && tryLinkOnce(el)) { /* ще одна категорія в цьому ж абзаці */ }
  });

  return linked ? $.html() : html;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
