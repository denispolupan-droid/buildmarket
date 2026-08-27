import type { CategoryMeta } from '../category-descriptions';

// Аудит категорійного контенту: чи не розійшовся текст категорії з фактичним
// асортиментом і чи відповідає категорія стандарту контенту
// (docs/CONTENT-STANDARD.md, розділ 1). Перевіряються лише машинно-перевірювані
// твердження — бренди (закритий список із БД), наявність товару, повнота FAQ,
// наявність і склад гайда, попит із GSC. Прозу («текст обіцяє наждачний папір»)
// автоматично не перевіряємо: там самі лише хибні спрацювання.
//
// Бренди шукаємо НЕ по всьому тексту, а лише в «каталожному» реченні — тому,
// що містить FIXLINE. За конвенцією саме там перелічують асортимент, і завдяки
// цьому проза на кшталт «конструкційних сталей» не читається як бренд «Сталь».

export type AuditCategory = { slug: string; name: string; parent_slug: string | null };
export type AuditProduct = { category_slug: string | null; brand: string | null };
/** Попит зі Search Console за 28 днів: покази uk+ru сторінки й найчастіший запит */
export type AuditDemand = { impressions: number; topQuery: string | null };

export type CategoryAuditGaps = {
  /** є текст, але жодного активного товару — сторінка порожня */
  noProducts: boolean;
  /** є товар, але немає курованого тексту */
  noMeta: boolean;
  /** 1–4 товари в родині: рішення «пополнити чи згорнути» (стандарт 1.1) */
  thinCategory: boolean;
  /** у seoText немає переліку асортименту — текст не прив'язаний до каталогу */
  noCatalogLine: boolean;
  /** у тексті названі бренди, яких у категорії вже немає */
  staleBrands: boolean;
  /** помітна частка асортименту не згадана в тексті */
  missingBrands: boolean;
  /** менше 4 питань FAQ хоча б однією мовою (з гайдом — менше 7) */
  thinFaq: boolean;
  /** російська версія відстає від української */
  ruBehind: boolean;
  /** blogSlug вказує на статтю, якої немає — кнопка «Читати статтю» веде в 404 */
  deadBlogLink: boolean;
  /** 5+ товарів і ≥ MIN_DEMAND показів за 28 днів, а гайда «Як вибрати» немає (стандарт 1.4) */
  noGuide: boolean;
  /** гайд є, але без розділу «Де купити» — немає слів «купити»/«ціна» */
  guideNoBuy: boolean;
  /** український гайд є, російського немає або він помітно коротший */
  ruGuideBehind: boolean;
  /** слова найчастішого запиту сторінки не входять у назву категорії (uk або ru) */
  h1Mismatch: boolean;
};

export type CategoryAuditRow = {
  slug: string;
  name: string;
  productCount: number;
  actualBrands: { brand: string; count: number }[];
  claimedBrands: string[];
  staleBrands: string[];
  missingBrands: string[];
  uaFaq: number;
  ruFaq: number;
  /** slug статті, на яку посилається категорія, якщо такої статті немає */
  deadBlogSlug: string | null;
  /** слів у гайді uk / ru (0 — гайда немає) */
  guideWords: { ua: number; ru: number };
  /** покази за 28 днів (uk+ru) і найчастіший запит; null — даних GSC не було */
  demand: AuditDemand | null;
  gaps: CategoryAuditGaps;
};

/** Бренд згадано в тексті, якщо стоїть окремим словом (з урахуванням кирилиці). */
function mentions(text: string, brand: string): boolean {
  const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<!\\p{L})${escaped}(?!\\p{L})`, 'iu').test(text);
}

/** Речення з переліком асортименту. Порожній рядок, якщо його немає. */
export function catalogSentence(seoText: string | undefined): string {
  if (!seoText || !seoText.includes('FIXLINE')) return '';
  return seoText
    .split(/(?<=[.!?])\s+/)
    .filter(s => s.includes('FIXLINE'))
    .join(' ');
}

const guideText = (m: CategoryMeta | undefined): string =>
  m?.guide ? [m.guide.title, ...m.guide.sections.flatMap(s => [s.h, ...s.p])].join(' ') : '';
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Слова запиту, які мають бути в назві: без службових і комерційних модифікаторів. */
const QUERY_STOP = new Set(['для', 'від', 'под', 'из', 'на', 'по', 'та', 'и', 'в', 'с', 'к', 'купити', 'купить', 'ціна', 'цена', 'вартість', 'стоимость', 'ціни', 'цены', 'замовити', 'заказать', 'україна', 'украина', 'київ', 'киев', 'дешево', 'оптом', 'опт']);
export function queryWords(q: string): string[] {
  return q.toLowerCase().replace(/[’ʼ`]/g, "'").split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 4 && !QUERY_STOP.has(w));
}
/**
 * Назва «відповідає запиту», якщо містить його ПЕРШЕ значуще слово — в укр/рос
 * запитах це або головний іменник («морилка для дерева»), або ключовий
 * модифікатор («бітумний праймер», «противогрибковая грунтовка»). Вимагати всі
 * слова не можна: «морилка для дерева» не значить, що категорію треба
 * перейменувати в «Морилки для дерева». Порівнюємо стеми (4 літери для
 * коротких слів, 5 для довших): «фарбу» ↔ «Фарби», «праймер» ↔ «Праймери».
 */
export function nameCoversQuery(names: string[], q: string): boolean {
  const hay = names.map(n => n.toLowerCase().replace(/[’ʼ`]/g, "'")).join(' | ');
  const [first] = queryWords(q);
  if (!first) return true;
  return hay.includes(first.slice(0, first.length <= 6 ? 4 : 5));
}

/** Бренд вважаємо «пропущеним», лише якщо він помітний — інакше буде шум. */
const MIN_SHARE = 0.1;
const MIN_COUNT = 3;
const MIN_FAQ = 4;
/** Категорія з гайдом має відповідати на більше питань (стандарт 1.5). */
const MIN_FAQ_GUIDE = 7;
/** Гайд потрібен від цієї кількості товарів у родині… */
export const MIN_PRODUCTS_FOR_GUIDE = 5;
/** …і від цієї кількості показів за 28 днів (стандарт 1.4). */
export const MIN_DEMAND = 25;
/** Російський гайд «відстає», якщо коротший за український більш ніж на цю частку. */
const RU_GUIDE_TOLERANCE = 0.3;

export function auditCategories(input: {
  categories: AuditCategory[];
  products: AuditProduct[];
  metaUa: Record<string, CategoryMeta>;
  metaRu: Record<string, CategoryMeta>;
  brands: string[];
  /** slug'и опублікованих статей блогу; без них перевірку посилань пропускаємо */
  blogSlugs?: string[];
  /** попит із GSC по слагу; без нього перевірки «немає гайда» і «H1 ≠ запит» пропускаємо */
  demand?: Record<string, AuditDemand>;
  /** російські назви категорій (lib/ru) — для перевірки H1 проти російського запиту */
  namesRu?: Record<string, string>;
}): CategoryAuditRow[] {
  const { categories, products, metaUa, metaRu, brands, blogSlugs, demand, namesRu } = input;
  const knownBlog = blogSlugs ? new Set(blogSlugs) : null;

  // Товари прив'язані до підкатегорій — для батьківської беремо всю родину
  const children = new Map<string, string[]>();
  for (const c of categories) {
    if (!c.parent_slug) continue;
    if (!children.has(c.parent_slug)) children.set(c.parent_slug, []);
    children.get(c.parent_slug)!.push(c.slug);
  }
  const family = (slug: string): Set<string> => {
    const out = [slug];
    for (let i = 0; i < out.length; i++) for (const k of children.get(out[i]) ?? []) out.push(k);
    return new Set(out);
  };

  const bySlug = new Map<string, AuditProduct[]>();
  for (const p of products) {
    if (!p.category_slug) continue;
    if (!bySlug.has(p.category_slug)) bySlug.set(p.category_slug, []);
    bySlug.get(p.category_slug)!.push(p);
  }

  const slugs = new Set([...categories.map(c => c.slug), ...Object.keys(metaUa)]);
  const rows: CategoryAuditRow[] = [];

  for (const slug of slugs) {
    const cat = categories.find(c => c.slug === slug);
    const ua = metaUa[slug];
    const ru = metaRu[slug];

    const fam = family(slug);
    const items = [...fam].flatMap(s => bySlug.get(s) ?? []);
    const productCount = items.length;

    // Категорія не існує ні в БД, ні в товарах, ні в тексті — пропускаємо
    if (!cat && !ua) continue;

    const counts = new Map<string, number>();
    for (const p of items) if (p.brand) counts.set(p.brand, (counts.get(p.brand) ?? 0) + 1);
    const actualBrands = [...counts.entries()]
      .map(([brand, count]) => ({ brand, count }))
      .sort((a, b) => b.count - a.count);

    const sentence = catalogSentence(ua?.seoText);
    const claimedBrands = sentence ? brands.filter(b => mentions(sentence, b)) : [];
    const actualSet = new Set(actualBrands.map(b => b.brand));

    const staleBrands = claimedBrands.filter(b => !actualSet.has(b));
    const missingBrands = sentence
      ? actualBrands
          .filter(b => b.count >= MIN_COUNT && b.count / productCount >= MIN_SHARE)
          .map(b => b.brand)
          .filter(b => !claimedBrands.includes(b))
      : [];

    const uaFaq = ua?.faq?.length ?? 0;
    const ruFaq = ru?.faq?.length ?? 0;

    // Стаття могла бути перейменована чи знята з публікації — тоді кнопка
    // «Читати статтю» на сторінці категорії веде в 404. Дивимось обидві мови:
    // RU-карта має власні blogSlug і теж може відстати.
    const linked = [ua?.blogSlug, ru?.blogSlug].filter(Boolean) as string[];
    const deadBlogSlug = knownBlog ? (linked.find(s => !knownBlog.has(s)) ?? null) : null;

    const guideUa = guideText(ua);
    const guideRu = guideText(ru);
    const guideWords = { ua: words(guideUa), ru: words(guideRu) };
    const hasGuide = guideWords.ua > 0;
    const minFaq = hasGuide ? MIN_FAQ_GUIDE : MIN_FAQ;
    const d = demand?.[slug] ?? null;
    const inDemand = !!d && d.impressions >= MIN_DEMAND;
    const names = [cat?.name ?? slug, namesRu?.[slug] ?? ''].filter(Boolean);

    rows.push({
      slug,
      name: cat?.name ?? slug,
      productCount,
      actualBrands,
      claimedBrands,
      staleBrands,
      missingBrands,
      uaFaq,
      ruFaq,
      deadBlogSlug,
      guideWords,
      demand: d,
      gaps: {
        noProducts: !!ua && productCount === 0,
        noMeta: !ua && productCount > 0,
        thinCategory: productCount > 0 && productCount < MIN_PRODUCTS_FOR_GUIDE,
        noCatalogLine: !!ua && productCount > 0 && !sentence,
        staleBrands: staleBrands.length > 0,
        missingBrands: missingBrands.length > 0,
        thinFaq: !!ua && productCount > 0 && (uaFaq < minFaq || ruFaq < minFaq),
        ruBehind: !!ua && (!ru || ruFaq < uaFaq),
        deadBlogLink: deadBlogSlug !== null,
        noGuide: !hasGuide && productCount >= MIN_PRODUCTS_FOR_GUIDE && inDemand,
        guideNoBuy: hasGuide && !/купит|ціна|цін[аи]|коштує/iu.test(guideUa),
        ruGuideBehind: hasGuide && guideWords.ru < guideWords.ua * (1 - RU_GUIDE_TOLERANCE),
        h1Mismatch: inDemand && !!d.topQuery && !nameCoversQuery(names, d.topQuery),
      },
    });
  }

  return rows.sort((a, b) => (b.demand?.impressions ?? 0) - (a.demand?.impressions ?? 0) || b.productCount - a.productCount);
}

export function hasCategoryGap(row: CategoryAuditRow): boolean {
  return Object.values(row.gaps).some(Boolean);
}
