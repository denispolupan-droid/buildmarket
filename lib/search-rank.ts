/**
 * Ранжування підказок пошуку на головній. Чиста функція — без fetch і DOM,
 * покрита тестом (tests/search-rank.test.ts). Дані — з /api/search-index.
 */

export type SuggestProduct = {
  sku: string;
  slug: string | null;
  name: string;
  name_ru: string | null;
  brand: string;
  volume: string | null;
  image: string | null;
  nl1: string | null;
  nl2: string | null;
  bc: string;
  ac: string;
  img_type: 'tube' | 'canister';
  stock: {
    price_retail: number | null;
    price_promo: number | null;
    stock_status: 'in_stock' | 'out_of_stock' | 'on_order';
    stock_qty: number;
  } | null;
};

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().trim();
const wordsOf = (s: string) => s.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/**
 * Морфологія — той самий прийом, що в пошуку блогу: підрядковий збіг ламається
 * на відмінках («піни» не входить у «піна монтажна»), тому слово запиту від
 * 4 літер обрізаємо до основи (мінус два останні символи, але не коротше
 * трьох) і шукаємо за префіксом слова. Коротким словам — тільки прямий збіг.
 */
type TermHit = 'direct' | 'stem' | null;
function termHit(hay: string, hayWords: string[], term: string): TermHit {
  if (hay.includes(term)) return 'direct';
  if (term.length < 4) return null;
  const stem = term.slice(0, Math.max(3, term.length - 2));
  return hayWords.some(w => w.startsWith(stem)) ? 'stem' : null;
}

/** Всі слова запиту мають збігтися: 2 = все прямо, 1 = з основами, 0 = ні. */
function fieldTier(field: string, terms: string[]): 0 | 1 | 2 {
  if (!field) return 0;
  const hayWords = wordsOf(field);
  let allDirect = true;
  for (const term of terms) {
    const hit = termHit(field, hayWords, term);
    if (!hit) return 0;
    if (hit !== 'direct') allDirect = false;
  }
  return allDirect ? 2 : 1;
}

function score(p: SuggestProduct, q: string, terms: string[], lang: 'uk' | 'ru'): number {
  const sku = norm(p.sku);
  if (sku === q) return 1000;                 // точний артикул — завжди перший
  if (sku.startsWith(q)) return 500;
  const name = norm(lang === 'ru' ? (p.name_ru ?? p.name) : p.name);
  const nameAlt = norm(lang === 'ru' ? p.name : p.name_ru);
  const brand = norm(p.brand);
  if (name.startsWith(q)) return 300;
  if (brand === q) return 250;
  const nameTier = fieldTier(name, terms);
  if (nameTier === 2) return 200;
  if (nameTier === 1) return 160;
  if (brand.startsWith(q)) return 150;
  const altTier = fieldTier(nameAlt, terms);
  if (altTier === 2) return 120;
  if (altTier === 1) return 110;
  if (brand.includes(q)) return 100;
  return 0;
}

export function rankProducts(
  products: SuggestProduct[],
  query: string,
  lang: 'uk' | 'ru',
  limit = 6,
): SuggestProduct[] {
  const q = norm(query);
  if (q.length < 2) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  const scored: { p: SuggestProduct; s: number }[] = [];
  for (const p of products) {
    const s = score(p, q, terms, lang);
    if (s > 0) scored.push({ p, s });
  }
  // При рівному рахунку — «в наявності» вище, далі за назвою
  scored.sort((a, b) =>
    b.s - a.s
    || Number(b.p.stock?.stock_status === 'in_stock') - Number(a.p.stock?.stock_status === 'in_stock')
    || a.p.name.localeCompare(b.p.name));
  return scored.slice(0, limit).map(x => x.p);
}
