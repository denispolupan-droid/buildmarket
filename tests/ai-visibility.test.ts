import { describe, it, expect } from 'vitest';
import { detectAiBot, detectAiReferral, botLabel, referralLabel, AI_BOT_TOKENS_ALLOWED, AI_BOT_TOKENS_TRAINING } from '../lib/ai-crawlers';
import { sectionOf } from '../lib/ai-visits';
import { productMarkdown, categoryMarkdown, mdPrice, mdAvailability, CATEGORY_PRODUCT_LIMIT, type MdProductInput, type MdCategoryInput } from '../lib/llms-md';

// Видимість у ШІ-пошуку: детект краулерів, облік переходів і Markdown-версії
// сторінок. Все це — чисті функції, тому перевіряється без бази й рендера.

describe('detectAiBot', () => {
  it('впізнає пошукового бота OpenAI', () => {
    expect(detectAiBot('Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot')).toBe('OAI-SearchBot');
  });

  it('відрізняє навчальний GPTBot від пошукового OAI-SearchBot', () => {
    expect(detectAiBot('Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)')).toBe('GPTBot');
  });

  it('бере найдовший збіг, а не перший-ліпший', () => {
    // 'claudebot' — підрядок не тільки самого ClaudeBot: якщо брати перший
    // збіг зі списку, Claude-SearchBot записався б чужим іменем
    expect(detectAiBot('Mozilla/5.0 (compatible; Claude-SearchBot/1.0)')).toBe('Claude-SearchBot');
    expect(detectAiBot('Mozilla/5.0 (compatible; ClaudeBot/1.0)')).toBe('ClaudeBot');
  });

  it('не реагує на звичайні браузери й Googlebot', () => {
    expect(detectAiBot('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120')).toBeNull();
    expect(detectAiBot('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBeNull();
    expect(detectAiBot(null)).toBeNull();
  });

  it('Google-Extended не детектується у трафіку — це лише токен robots.txt', () => {
    expect(detectAiBot('Google-Extended')).toBeNull();
    // але підпис для нього все одно є, бо в robots.txt він присутній
    expect(botLabel('Google-Extended')).toContain('Gemini');
  });
});

describe('розподіл ботів у robots.txt', () => {
  it('пошукові боти лишаються відкритими — саме вони дають цитування', () => {
    for (const id of ['OAI-SearchBot', 'PerplexityBot', 'Google-Extended', 'Applebot-Extended', 'Claude-SearchBot']) {
      expect(AI_BOT_TOKENS_ALLOWED).toContain(id);
    }
  });

  it('навчальні закриті, і серед них немає жодного пошукового', () => {
    expect(AI_BOT_TOKENS_TRAINING).toContain('GPTBot');
    expect(AI_BOT_TOKENS_TRAINING).toContain('CCBot');
    // Головна пастка цього рішення: заблокувати разом з GPTBot і OAI-SearchBot —
    // це вже прямий вихід з відповідей ChatGPT, а не економія на навчанні
    expect(AI_BOT_TOKENS_TRAINING).not.toContain('OAI-SearchBot');
    expect(AI_BOT_TOKENS_TRAINING).not.toContain('ChatGPT-User');
  });

  it('групи не перетинаються — бот не може бути в обох', () => {
    const overlap = AI_BOT_TOKENS_ALLOWED.filter(id => AI_BOT_TOKENS_TRAINING.includes(id));
    expect(overlap).toEqual([]);
  });
});

describe('detectAiReferral', () => {
  it('ловить перехід за Referer', () => {
    expect(detectAiReferral('https://www.perplexity.ai/search?q=germetyk', null)).toBe('perplexity');
    expect(detectAiReferral('https://chatgpt.com/', null)).toBe('chatgpt');
  });

  it('ловить перехід за utm_source, коли Referer порожній', () => {
    // ChatGPT часто ріже Referer, лишаючи тільки мітку в URL
    expect(detectAiReferral(null, 'chatgpt.com')).toBe('chatgpt');
    expect(detectAiReferral('', 'chatgpt')).toBe('chatgpt');
  });

  it('не плутає піддомен джерела з чужим доменом', () => {
    expect(detectAiReferral('https://sub.perplexity.ai/x', null)).toBe('perplexity');
    expect(detectAiReferral('https://notperplexity.ai/x', null)).toBeNull();
  });

  it('переживає сміттєвий Referer і перевіряє utm далі', () => {
    expect(detectAiReferral('не-url', 'perplexity')).toBe('perplexity');
    expect(detectAiReferral('не-url', null)).toBeNull();
  });

  it('звичайний пошук і соцмережі сюди не потрапляють', () => {
    expect(detectAiReferral('https://www.google.com/', null)).toBeNull();
    expect(detectAiReferral('https://www.facebook.com/', null)).toBeNull();
    expect(referralLabel('chatgpt')).toBe('ChatGPT');
  });
});

describe('sectionOf', () => {
  it('групує шляхи по розділах і не залежить від мовного префікса', () => {
    expect(sectionOf('/')).toBe('головна');
    expect(sectionOf('/ru')).toBe('головна');
    expect(sectionOf('/product/germetyk-ceresit')).toBe('товар');
    expect(sectionOf('/ru/product/germetyk-ceresit')).toBe('товар');
    expect(sectionOf('/shop/germetyky')).toBe('категорія');
    expect(sectionOf('/blog/yak-vybraty')).toBe('блог');
  });

  it('окремо рахує Markdown-шар — заради нього все й робилось', () => {
    expect(sectionOf('/product/germetyk.md')).toBe('markdown');
    expect(sectionOf('/shop/germetyky.md')).toBe('markdown');
    expect(sectionOf('/llms.txt')).toBe('llms.txt');
  });
});

const stock = (over: Partial<NonNullable<MdProductInput['stock']>> = {}) => ({
  price_retail: 200, price_retail_old: null, price_promo: null,
  stock_status: 'in_stock' as const, stock_qty: 5, ...over,
});

describe('ціна і наявність у Markdown', () => {
  it('акційна ціна перебиває роздрібну — так само, як на сторінці', () => {
    expect(mdPrice(stock({ price_promo: 149 }))).toBe(149);
    expect(mdPrice(stock())).toBe(200);
    expect(mdPrice(null)).toBeNull();
  });

  it('наявність не бреше при нульовому залишку з прапорцем постачальника', () => {
    expect(mdAvailability(stock({ stock_qty: 0 }))).toBe('в наявності');
    expect(mdAvailability(stock({ stock_status: 'out_of_stock' }))).toBe('немає в наявності');
    expect(mdAvailability(stock({ stock_status: 'on_order', stock_qty: 0 }))).toBe('під замовлення');
  });
});

const product = (over: Partial<MdProductInput> = {}): MdProductInput => ({
  sku: '1234-001',
  slug: 'germetyk-ceresit-cs-24',
  name: 'Герметик силіконовий CS 24',
  brand: 'Ceresit',
  volume: '280 мл',
  description: 'Універсальний прозорий силікон.',
  description_full: 'Перший абзац.\n\nДругий абзац.',
  updated_at: '2026-08-19T10:00:00Z',
  stock: stock({ price_promo: 149, price_retail: 200 }),
  characteristics: [{ label: 'Колір', value: 'RAL 7016 | антрацит' }],
  category: { slug: 'sylikonovi-germetyky', name: 'Силіконові герметики' },
  parentCategory: { slug: 'germetyky', name: 'Герметики' },
  faq: [{ question: 'Чи фарбується?', answer: 'Ні.' }],
  rating: { avg: 4.7, count: 12 },
  related: [{ name: 'Герметик CS 25', slug: 'germetyk-cs-25', sku: '1234-002', price: 180 }],
  ...over,
});

describe('productMarkdown', () => {
  it('виносить ціну, наявність і адресу сторінки у факти на початку', () => {
    const md = productMarkdown(product());
    expect(md.startsWith('# Ceresit Герметик силіконовий CS 24')).toBe(true);
    expect(md).toContain('- **Ціна:** 149 грн (стара ціна 200 грн)');
    expect(md).toContain('- **Наявність:** в наявності');
    expect(md).toContain('https://fixline.com.ua/product/germetyk-ceresit-cs-24');
    // порядок: факти йдуть до опису, щоб обірване читання втратило найменш цінне
    expect(md.indexOf('- **Ціна:**')).toBeLessThan(md.indexOf('## Опис'));
  });

  it('не дублює бренд, якщо він уже в назві', () => {
    const md = productMarkdown(product({ name: 'Ceresit CS 24' }));
    expect(md.startsWith('# Ceresit CS 24\n')).toBe(true);
  });

  it('екранує трубу в характеристиках — інакше зʼїжджає вся таблиця', () => {
    const md = productMarkdown(product());
    expect(md).toContain('| Колір | RAL 7016 \\| антрацит |');
  });

  it('переживає товар без ціни, опису, характеристик і FAQ', () => {
    const md = productMarkdown(product({
      stock: null, description: null, description_full: null,
      characteristics: [], faq: [], rating: null, related: [],
    }));
    expect(md).toContain('- **Ціна:** уточнюйте у продавця');
    expect(md).not.toContain('## Характеристики');
    expect(md).not.toContain('undefined');
  });
});

const category = (over: Partial<MdCategoryInput> = {}): MdCategoryInput => ({
  slug: 'germetyky',
  name: 'Герметики',
  description: 'Герметики для швів.',
  seoText: null,
  parent: null,
  children: [{ slug: 'sylikonovi-germetyky', name: 'Силіконові', count: 40 }],
  products: [
    { sku: '1', slug: 'a', name: 'Товар A', brand: 'Ceresit', volume: '280 мл', stock: stock({ price_retail: 200 }) },
    { sku: '2', slug: 'b', name: 'Товар B', brand: 'Lacrysil', volume: null, stock: stock({ price_retail: 90, stock_status: 'out_of_stock' }) },
  ],
  faq: [{ q: 'Питання?', a: 'Відповідь.' }],
  totalCount: 2,
  ...over,
});

describe('categoryMarkdown', () => {
  it('дає діапазон цін, бренди і таблицю позицій', () => {
    const md = categoryMarkdown(category());
    expect(md).toContain('- **Товарів у категорії:** 2');
    expect(md).toContain('- **Ціни:** від 90 грн до 200 грн');
    expect(md).toContain('- **Бренди:** Ceresit, Lacrysil');
    expect(md).toContain('| [Товар A](https://fixline.com.ua/product/a) | Ceresit | 280 мл | 200 грн | в наявності |');
    expect(md).toContain('| [Товар B](https://fixline.com.ua/product/b) | Lacrysil | — | 90 грн | немає в наявності |');
  });

  it('обрізає довгий список і чесно про це пише', () => {
    const many = Array.from({ length: CATEGORY_PRODUCT_LIMIT + 20 }, (_, i) => ({
      sku: String(i), slug: `p${i}`, name: `Товар ${i}`, brand: 'Ceresit', volume: null, stock: stock(),
    }));
    const md = categoryMarkdown(category({ products: many, totalCount: many.length }));
    expect(md).toContain(`Показано ${CATEGORY_PRODUCT_LIMIT} з ${many.length} позицій`);
    expect(md).not.toContain(`Товар ${CATEGORY_PRODUCT_LIMIT + 5}]`);
  });

  it('порожня категорія не ламає розмітку', () => {
    const md = categoryMarkdown(category({ products: [], totalCount: 0, children: [], faq: [] }));
    expect(md).toContain('- **Товарів у категорії:** 0');
    expect(md).not.toContain('## Товари');
  });
});
