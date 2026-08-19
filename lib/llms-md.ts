// Markdown-версії сторінок для мовних моделей.
//
// Навіщо: коли ChatGPT або Perplexity відкриває наш товар, він тягне HTML на
// сотні кілобайт — вміст лежить у React-розмітці разом зі стилями, скриптами і
// службовими вузлами. Модель бачить факти впереміш зі сміттям, а бюджет
// контексту в неї скінченний: до половини сторінки просто не доїжджає. Той
// самий товар у Markdown — 1–2 КБ чистих фактів, де ціна, наявність і
// характеристики стоять там, де їх шукають.
//
// Це та сама сторінка, а не окрема «версія для ботів»: адреса відрізняється
// лише розширенням (/product/x → /product/x.md), дані беруться з тих самих
// функцій, ціна рахується тим самим retailPrice. Клоакінгу тут немає — HTML і
// Markdown зобов'язані розходитися тільки формою.
//
// Функції навмисно чисті (дані на вхід, рядок на вихід): так їх покриває
// звичайний unit-тест без бази й рендера.

import { SITE_URL } from './site';

const nbspFix = (s: string) => s.replace(/ /g, ' ');
const collapse = (s: string) => nbspFix(s).replace(/[ \t]+/g, ' ').trim();

/** Абзаци: у БД описи розділені порожнім рядком або одинарним переносом. */
function paragraphs(text: string): string[] {
  return nbspFix(text)
    .split(/\n{2,}|\r\n\r\n/)
    .map(p => collapse(p.replace(/\s*\n\s*/g, ' ')))
    .filter(Boolean);
}

/**
 * Екранування для таблиці: `|` всередині клітинки ламає розмітку рядка, і далі
 * зʼїжджає ВСЯ таблиця, а не одна комірка. У характеристиках труба трапляється
 * («RAL 7016 | антрацит»), тому це не теоретичний випадок.
 */
const cell = (s: string) => collapse(s).replace(/\|/g, '\\|');

export const money = (n: number) =>
  `${n.toLocaleString('uk-UA', { maximumFractionDigits: 2 })} грн`;

export type MdStock = {
  price_retail: number | null;
  price_retail_old: number | null;
  price_promo: number | null;
  stock_status: 'in_stock' | 'out_of_stock' | 'on_order';
  stock_qty: number;
} | null;

/** Ціна для ШІ — рівно та, що бачить гість: акційна, інакше роздрібна. */
export function mdPrice(stock: MdStock): number | null {
  if (!stock) return null;
  return stock.price_promo ?? stock.price_retail ?? null;
}

export function mdAvailability(stock: MdStock): string {
  if (!stock) return 'уточнюйте';
  if (stock.stock_status === 'in_stock') return 'в наявності';
  if (stock.stock_status === 'out_of_stock') return 'немає в наявності';
  return stock.stock_qty > 0 ? 'в наявності' : 'під замовлення';
}

export type MdProductInput = {
  sku: string;
  slug: string | null;
  name: string;
  brand: string;
  volume: string | null;
  description: string | null;
  description_full: string | null;
  updated_at: string | null;
  stock: MdStock;
  characteristics: { label: string; value: string }[];
  category: { slug: string; name: string } | null;
  parentCategory: { slug: string; name: string } | null;
  faq: { question: string; answer: string }[];
  rating: { avg: number; count: number } | null;
  related: { name: string; slug: string | null; sku: string; price: number | null }[];
};

export function productUrl(p: { slug: string | null; sku: string }): string {
  return `${SITE_URL}/product/${p.slug ?? p.sku}`;
}

/**
 * Картка товару в Markdown.
 *
 * Порядок блоків не випадковий: спершу факти, які модель цитує найчастіше
 * (ціна, наявність, бренд, артикул), потім опис, характеристики й FAQ. Якщо
 * модель обірве читання на середині — обірветься найменш цінне.
 */
export function productMarkdown(p: MdProductInput): string {
  const title = collapse(
    p.name.toLowerCase().includes(p.brand.toLowerCase()) ? p.name : `${p.brand} ${p.name}`,
  );
  const price = mdPrice(p.stock);
  const old = p.stock?.price_promo ? p.stock.price_retail : p.stock?.price_retail_old ?? null;

  const out: string[] = [];
  out.push(`# ${title}`);
  out.push('');
  if (p.description) {
    out.push(`> ${collapse(p.description)}`);
    out.push('');
  }

  const facts: string[] = [];
  facts.push(`- **Артикул:** ${p.sku}`);
  facts.push(`- **Бренд:** ${collapse(p.brand)}`);
  if (p.volume) facts.push(`- **Фасовка:** ${collapse(p.volume)}`);
  facts.push(price !== null
    ? `- **Ціна:** ${money(price)}${old && old > price ? ` (стара ціна ${money(old)})` : ''}`
    : '- **Ціна:** уточнюйте у продавця');
  facts.push(`- **Наявність:** ${mdAvailability(p.stock)}`);
  if (p.category) {
    const chain = [p.parentCategory, p.category].filter(Boolean) as { slug: string; name: string }[];
    facts.push(`- **Категорія:** ${chain.map(c => `[${c.name}](${SITE_URL}/shop/${c.slug})`).join(' → ')}`);
  }
  if (p.rating && p.rating.count > 0) {
    facts.push(`- **Оцінка покупців:** ${p.rating.avg.toFixed(1)} з 5 (відгуків: ${p.rating.count})`);
  }
  facts.push(`- **Сторінка товару:** ${productUrl(p)}`);
  facts.push('- **Продавець:** FIXLINE, доставка Новою Поштою та у точки ROZETKA по Україні');
  if (p.updated_at) facts.push(`- **Дані оновлено:** ${p.updated_at.slice(0, 10)}`);
  out.push(facts.join('\n'));

  const fullText = p.description_full ?? p.description;
  if (fullText) {
    out.push('', '## Опис', '');
    out.push(paragraphs(fullText).join('\n\n'));
  }

  if (p.characteristics.length) {
    out.push('', '## Характеристики', '');
    out.push('| Параметр | Значення |');
    out.push('| --- | --- |');
    for (const c of p.characteristics) out.push(`| ${cell(c.label)} | ${cell(c.value)} |`);
  }

  if (p.faq.length) {
    out.push('', '## Питання та відповіді', '');
    for (const f of p.faq) {
      out.push(`### ${collapse(f.question)}`);
      out.push('');
      out.push(collapse(f.answer));
      out.push('');
    }
  }

  if (p.related.length) {
    out.push('', '## Схожі товари', '');
    for (const r of p.related) {
      const priceTail = r.price !== null ? ` — ${money(r.price)}` : '';
      out.push(`- [${collapse(r.name)}](${productUrl(r)})${priceTail}`);
    }
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

export type MdCategoryProduct = {
  sku: string;
  slug: string | null;
  name: string;
  brand: string;
  volume: string | null;
  stock: MdStock;
};

export type MdCategoryInput = {
  slug: string;
  name: string;
  description: string | null;
  seoText: string | null;
  parent: { slug: string; name: string } | null;
  children: { slug: string; name: string; count: number }[];
  products: MdCategoryProduct[];
  faq: { q: string; a: string }[];
  /** Скільки товарів у категорії всього — список нижче може бути обрізаний. */
  totalCount: number;
};

/** Скільки позицій виводимо списком. Далі — посилання на сторінку категорії. */
export const CATEGORY_PRODUCT_LIMIT = 150;

/**
 * Категорія в Markdown — фактично прайс однією таблицею.
 *
 * Саме цього не вміє HTML-листинг: там ціни розкидані по картках і половина
 * позицій підвантажується скролом, тобто для моделі їх просто не існує.
 */
export function categoryMarkdown(c: MdCategoryInput): string {
  const out: string[] = [];
  out.push(`# ${collapse(c.name)}`);
  out.push('');
  if (c.description) { out.push(`> ${collapse(c.description)}`); out.push(''); }

  const prices = c.products.map(p => mdPrice(p.stock)).filter((n): n is number => n !== null);
  const facts: string[] = [];
  facts.push(`- **Товарів у категорії:** ${c.totalCount}`);
  if (prices.length) {
    facts.push(`- **Ціни:** від ${money(Math.min(...prices))} до ${money(Math.max(...prices))}`);
  }
  const brands = [...new Set(c.products.map(p => collapse(p.brand)))].sort();
  if (brands.length) facts.push(`- **Бренди:** ${brands.join(', ')}`);
  if (c.parent) facts.push(`- **Розділ:** [${c.parent.name}](${SITE_URL}/shop/${c.parent.slug})`);
  facts.push(`- **Сторінка категорії:** ${SITE_URL}/shop/${c.slug}`);
  out.push(facts.join('\n'));

  if (c.seoText) { out.push('', '## Про категорію', '', paragraphs(c.seoText).join('\n\n')); }

  if (c.children.length) {
    out.push('', '## Підкатегорії', '');
    for (const ch of c.children) {
      out.push(`- [${collapse(ch.name)}](${SITE_URL}/shop/${ch.slug}) — товарів: ${ch.count}`);
    }
  }

  if (c.products.length) {
    out.push('', '## Товари', '');
    out.push('| Товар | Бренд | Фасовка | Ціна | Наявність |');
    out.push('| --- | --- | --- | --- | --- |');
    for (const p of c.products.slice(0, CATEGORY_PRODUCT_LIMIT)) {
      const price = mdPrice(p.stock);
      const cells = [
        `[${cell(p.name)}](${productUrl(p)})`,
        cell(p.brand),
        p.volume ? cell(p.volume) : '—',
        price !== null ? money(price) : '—',
        mdAvailability(p.stock),
      ];
      out.push(`| ${cells.join(' | ')} |`);
    }
    if (c.totalCount > CATEGORY_PRODUCT_LIMIT) {
      out.push('');
      out.push(`Показано ${CATEGORY_PRODUCT_LIMIT} з ${c.totalCount} позицій — повний список на ${SITE_URL}/shop/${c.slug}`);
    }
  }

  if (c.faq.length) {
    out.push('', '## Питання та відповіді', '');
    for (const f of c.faq) {
      out.push(`### ${collapse(f.q)}`);
      out.push('');
      out.push(collapse(f.a));
      out.push('');
    }
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

export type LlmsTxtInput = {
  categories: { slug: string; name: string; description: string | null; count: number; minPrice: number | null; maxPrice: number | null }[];
  brands: { name: string; slug: string; count: number }[];
  posts: { slug: string; title: string; excerpt: string | null }[];
  totalProducts: number;
};

/**
 * /llms.txt — карта сайту для моделей (llmstxt.org).
 *
 * Це не заміна sitemap.xml: sitemap каже пошуковику ЩО обійти, llms.txt каже
 * моделі, що тут взагалі за сайт і куди йти за фактами. Тому тут описи й цифри,
 * а не 6000 URL — на повний перелік у моделі немає ні контексту, ні бажання.
 */
export function llmsTxt(d: LlmsTxtInput): string {
  const out: string[] = [];
  out.push('# FIXLINE');
  out.push('');
  out.push('> Цифрова платформа будівельної хімії: герметики, піни, клеї, ґрунтовки та супутні матеріали провідних брендів. Роздріб і опт по всій Україні, доставка Новою Поштою та у точки видачі ROZETKA.');
  out.push('');
  // Формулювання без узгодження числівника навмисно: «773 позицій» і
  // «22 позиції» — різні форми, а рядок збирається з живої цифри.
  out.push(`Позицій у каталозі: ${d.totalProducts}. Категорій: ${d.categories.length}. Ціни й наявність на сторінках оновлюються щодня з даних постачальників.`);
  out.push('');
  out.push('Будь-яку сторінку товару чи категорії можна отримати у Markdown — додай `.md` до адреси:');
  out.push(`\`${SITE_URL}/product/<slug>.md\`, \`${SITE_URL}/shop/<category>.md\`.`);
  out.push('');

  out.push('## Категорії');
  out.push('');
  for (const c of d.categories) {
    const bits: string[] = [];
    // Крапку з опису прибираємо: далі йде «; товарів: N», і «…фасадів.; товарів»
    // виглядає як помилка склейки, хоча читається моделлю однаково.
    if (c.description) bits.push(collapse(c.description).replace(/\.$/, ''));
    bits.push(`товарів: ${c.count}`);
    if (c.minPrice !== null && c.maxPrice !== null) {
      bits.push(`ціни ${money(c.minPrice)} – ${money(c.maxPrice)}`);
    }
    out.push(`- [${collapse(c.name)}](${SITE_URL}/shop/${c.slug}): ${bits.join('; ')}`);
  }

  if (d.brands.length) {
    out.push('');
    out.push('## Бренди');
    out.push('');
    for (const b of d.brands) {
      out.push(`- [${collapse(b.name)}](${SITE_URL}/shop/brand/${b.slug}): товарів ${b.count}`);
    }
  }

  if (d.posts.length) {
    out.push('');
    out.push('## Статті та інструкції');
    out.push('');
    for (const p of d.posts) {
      out.push(`- [${collapse(p.title)}](${SITE_URL}/blog/${p.slug})${p.excerpt ? `: ${collapse(p.excerpt)}` : ''}`);
    }
  }

  out.push('');
  out.push('## Довідка');
  out.push('');
  out.push(`- [Про компанію](${SITE_URL}/about): хто ми, чим відрізняємось, для кого працюємо`);
  out.push(`- [Доставка](${SITE_URL}/delivery): Нова Пошта, точки ROZETKA, терміни й вартість`);
  out.push(`- [Повернення](${SITE_URL}/returns): умови повернення та обміну товару`);
  out.push(`- [Оптовим клієнтам](${SITE_URL}/opt): умови співпраці, мінімальне замовлення, знижки`);
  out.push(`- [Дропшипінг](${SITE_URL}/dropship): робота під замовлення без власного складу`);
  out.push(`- [Калькулятори](${SITE_URL}/calculators): розрахунок витрати матеріалів`);
  out.push(`- [Контакти](${SITE_URL}/contacts): телефони, реквізити, графік роботи`);
  out.push('');
  out.push('## Optional');
  out.push('');
  out.push(`- [Каталог сайту](${SITE_URL}/shop): повний перелік категорій і товарів`);
  out.push(`- [Акції](${SITE_URL}/shop/sale): позиції зі зниженою ціною`);
  out.push(`- [Блог](${SITE_URL}/blog): усі статті`);

  return out.join('\n') + '\n';
}
