/**
 * Зв'язка статей блогу з товарами — без AI.
 *
 * У кожної статті вже проставлені категорії магазину (blog_posts.related_links),
 * тож підібрати товари можна вибіркою з бази: жодних витрат на генерацію і жодного
 * ризику зіпсувати наявний текст. Блок посилань додається в кінець статті й
 * оновлюється на місці при повторному запуску (шукаємо його за заголовком).
 *
 * Посилання зберігаємо мовно-нейтральними (/product/...) — префікс /ru додає
 * localizeArticleHtml на рендері, як і для решти внутрішніх посилань статті.
 */

export type LinkProduct = {
  sku: string;
  slug: string | null;
  name: string;
  name_ru: string | null;
  brand: string;
  volume: string | null;
  price: number | null;
  category_slug: string | null;
  in_stock: boolean;
};

export const LINKS_HEADING: Record<'uk' | 'ru', string> = {
  uk: 'Чим це зробити',
  ru: 'Чем это сделать',
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Категорії статті → самі категорії + їхні підкатегорії (товари лежать у дочірніх). */
export function expandCategories(slugs: string[], childrenOf: Map<string, string[]>): string[] {
  const out: string[] = [];
  for (const s of slugs) {
    if (!out.includes(s)) out.push(s);
    for (const child of childrenOf.get(s) ?? []) {
      if (!out.includes(child)) out.push(child);
    }
  }
  return out;
}

/**
 * Підбір товарів для статті.
 *
 * Категорії приходять ГРУПАМИ в порядку статті: перша група — головна тема
 * («Клей для плитки»), решта — суміжні, згадані в тексті. Спершу брали драбину
 * по об'єднанню всіх груп — і головна тема губилась: у статті про клей для
 * плитки не було жодного клею для плитки, бо 7 його позицій потонули серед 109
 * кандидатів із суміжних категорій. Тому більшість слотів отримує головна
 * категорія, а від кожної суміжної беремо одну характерну позицію.
 *
 * Усередині групи — цінова драбина з різними брендами: стаття відповідає на
 * «що це і навіщо», тож блок має закривати різні ситуації читача (дешевий вхід,
 * середина, дорожчий бренд), а не показувати топ-1.
 */
export function pickArticleProducts(groups: LinkProduct[][], limit = 4): LinkProduct[] {
  const byPrice = (a: LinkProduct, b: LinkProduct) => (a.price ?? 0) - (b.price ?? 0);
  const clean = groups
    .map(g => g.filter(p => (p.price ?? 0) > 0 && p.in_stock).slice().sort(byPrice))
    .filter(g => g.length);
  if (!clean.length) return [];

  const [primary, ...others] = clean;
  const primaryQuota = Math.min(limit, Math.max(2, limit - others.length));

  const picked = priceLadder(primary, primaryQuota);
  const used = new Set(picked.map(p => p.sku));

  // По одній позиції з кожної суміжної категорії — найдешевшій. Раніше брали
  // медіанну за ціною, і в статті про фарбування радіаторів із «Розчинників»
  // випадково витягувало змивку клею замість перетворювача іржі. Найдешевша —
  // це «спробувати», доречний вхід у суміжну тему; ціновий діапазон і так
  // закриває драбина головної категорії.
  for (const g of others) {
    if (picked.length >= limit) break;
    const cheapest = g.find(p => !used.has(p.sku));
    if (!cheapest) continue;
    picked.push(cheapest);
    used.add(cheapest.sku);
  }

  // Лишились слоти (суміжних категорій мало) — добираємо з головної
  if (picked.length < limit) {
    for (const p of priceLadder(primary.filter(x => !used.has(x.sku)), limit - picked.length)) {
      picked.push(p);
      used.add(p.sku);
    }
  }

  return picked.sort(byPrice);
}

/** Рівномірна за ціною вибірка з перевагою ще не використаним брендам. */
function priceLadder(sorted: LinkProduct[], limit: number): LinkProduct[] {
  if (limit <= 0 || !sorted.length) return [];
  if (sorted.length <= limit) return sorted.slice();
  if (limit === 1) return [sorted[Math.floor(sorted.length / 2)]];

  const picked: LinkProduct[] = [];
  const brands = new Set<string>();
  const used = new Set<number>();

  for (let i = 0; i < limit; i++) {
    const target = Math.round((i * (sorted.length - 1)) / (limit - 1));
    let chosen = -1;
    let fallback = -1;
    for (let d = 0; d < sorted.length && chosen < 0; d++) {
      for (const idx of d === 0 ? [target] : [target - d, target + d]) {
        if (idx < 0 || idx >= sorted.length || used.has(idx)) continue;
        if (!brands.has(sorted[idx].brand)) { chosen = idx; break; }
        if (fallback < 0) fallback = idx;
      }
    }
    const pick = chosen >= 0 ? chosen : fallback;
    if (pick < 0) break;
    used.add(pick);
    brands.add(sorted[pick].brand);
    picked.push(sorted[pick]);
  }

  return picked.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
}

/** Підпис позиції: бренд не дублюємо, якщо він уже є в назві товару. */
export function productLabel(p: LinkProduct, lang: 'uk' | 'ru'): string {
  const name = (lang === 'ru' ? p.name_ru : null) ?? p.name;
  const hasBrand = name.toLowerCase().includes(p.brand.toLowerCase());
  return hasBrand ? name : `${p.brand} ${name}`;
}

export function buildLinksBlock(products: LinkProduct[], lang: 'uk' | 'ru'): string {
  if (!products.length) return '';
  const items = products.map(p => {
    const tail = [p.volume, p.price ? `${p.price} грн` : null].filter(Boolean).join(', ');
    const href = `/product/${p.slug ?? p.sku}`;
    return `<li><a href="${href}">${esc(productLabel(p, lang))}</a>${tail ? ` — ${esc(tail)}` : ''}</li>`;
  }).join('');
  return `<h2>${LINKS_HEADING[lang]}</h2><ul>${items}</ul>`;
}

/** Скільки посилань на товари вже є в тексті (щоб не чіпати статті з ручними). */
export function countProductLinks(html: string): number {
  return (html.match(/href="\/product\//g) ?? []).length;
}

/** Чи це наш згенерований блок (а не вручну вставлені посилання). */
export function hasLinksBlock(html: string, lang: 'uk' | 'ru'): boolean {
  return blockRe(lang).test(html);
}

function blockRe(lang: 'uk' | 'ru'): RegExp {
  return new RegExp(`<h2>${escRe(LINKS_HEADING[lang])}</h2>\\s*<ul>[\\s\\S]*?</ul>`, 'i');
}

/**
 * Вставити або оновити блок. Повторний запуск не плодить дублікати —
 * наявний блок замінюється новим (ціни й наявність могли змінитись).
 */
export function upsertLinksBlock(html: string, products: LinkProduct[], lang: 'uk' | 'ru'): string {
  const block = buildLinksBlock(products, lang);
  if (!block) return html;
  const re = blockRe(lang);
  if (re.test(html)) return html.replace(re, block);
  return html + block;
}
