import { describe, it, expect } from 'vitest';
import { auditCategories, catalogSentence, hasCategoryGap, nameCoversQuery } from '../lib/seo/category-audit';
import type { CategoryMeta } from '../lib/category-descriptions';

const BRANDS = ['Ceresit', 'AURA', 'Сталь', 'Титан', 'Lacrysil', 'Knauf'];

const cat = (slug: string, name = slug, parent_slug: string | null = null) => ({ slug, name, parent_slug });
const prod = (category_slug: string, brand: string) => ({ category_slug, brand });

function meta(seoText: string, faqCount = 5): CategoryMeta {
  return {
    description: 'опис',
    seoText,
    faq: Array.from({ length: faqCount }, (_, i) => ({ q: `q${i}`, a: `a${i}` })),
  };
}

describe('catalogSentence', () => {
  it('дістає лише речення з переліком асортименту', () => {
    const text = 'Герметик заповнює шви. У каталозі FIXLINE можна купити герметики Ceresit. Порівнюйте ціну за метр шва.';
    expect(catalogSentence(text)).toBe('У каталозі FIXLINE можна купити герметики Ceresit.');
  });

  it('повертає порожній рядок, якщо переліку немає', () => {
    expect(catalogSentence('Просто корисна порада без асортименту.')).toBe('');
    expect(catalogSentence(undefined)).toBe('');
  });
});

describe('auditCategories', () => {
  it('бачить бренд, якого вже немає в категорії', () => {
    const rows = auditCategories({
      categories: [cat('germetyky')],
      products: [prod('germetyky', 'Ceresit'), prod('germetyky', 'Lacrysil')],
      metaUa: { germetyky: meta('У каталозі FIXLINE можна купити герметики Ceresit, Lacrysil та Knauf.') },
      metaRu: { germetyky: meta('ru') },
      brands: BRANDS,
    });
    const row = rows.find(r => r.slug === 'germetyky')!;
    expect(row.staleBrands).toEqual(['Knauf']);
    expect(row.gaps.staleBrands).toBe(true);
  });

  it('не читає бренд-омонім із прози як твердження про асортимент', () => {
    // «конструкційних сталей» стоїть поза каталожним реченням — це не бренд «Сталь»
    const seo = 'Електроди для конструкційних сталей. У каталозі FIXLINE можна купити електроди Титан.';
    const rows = auditCategories({
      categories: [cat('elektrody')],
      products: [prod('elektrody', 'Титан'), prod('elektrody', 'Титан'), prod('elektrody', 'Титан')],
      metaUa: { elektrody: meta(seo) },
      metaRu: { elektrody: meta('ru') },
      brands: BRANDS,
    });
    const row = rows.find(r => r.slug === 'elektrody')!;
    expect(row.claimedBrands).toEqual(['Титан']);
    expect(row.staleBrands).toEqual([]);
  });

  it('рахує товар підкатегорій для батьківської категорії', () => {
    const rows = auditCategories({
      categories: [cat('farby'), cat('alkidni-farby', 'Алкідні', 'farby')],
      products: [prod('alkidni-farby', 'AURA'), prod('alkidni-farby', 'AURA')],
      metaUa: { farby: meta('У каталозі FIXLINE можна купити фарби AURA.') },
      metaRu: { farby: meta('ru') },
      brands: BRANDS,
    });
    expect(rows.find(r => r.slug === 'farby')!.productCount).toBe(2);
  });

  it('позначає порожню сторінку та категорію без тексту', () => {
    const rows = auditCategories({
      categories: [cat('porozhnya'), cat('bez-tekstu')],
      products: [prod('bez-tekstu', 'Ceresit')],
      metaUa: { porozhnya: meta('У каталозі FIXLINE можна купити щось.') },
      metaRu: { porozhnya: meta('ru') },
      brands: BRANDS,
    });
    expect(rows.find(r => r.slug === 'porozhnya')!.gaps.noProducts).toBe(true);
    expect(rows.find(r => r.slug === 'bez-tekstu')!.gaps.noMeta).toBe(true);
  });

  it('позначає текст без переліку асортименту', () => {
    const rows = auditCategories({
      categories: [cat('bez-pereliku')],
      products: [prod('bez-pereliku', 'Ceresit')],
      metaUa: { 'bez-pereliku': meta('Корисна порада без згадки каталогу.') },
      metaRu: { 'bez-pereliku': meta('ru') },
      brands: BRANDS,
    });
    const row = rows.find(r => r.slug === 'bez-pereliku')!;
    expect(row.gaps.noCatalogLine).toBe(true);
    expect(row.missingBrands).toEqual([]); // без переліку не звинувачуємо в пропусках
  });

  it('помічає помітний бренд, не згаданий у переліку', () => {
    const rows = auditCategories({
      categories: [cat('klei')],
      products: [
        ...Array.from({ length: 7 }, () => prod('klei', 'Ceresit')),
        ...Array.from({ length: 3 }, () => prod('klei', 'Lacrysil')),
      ],
      metaUa: { klei: meta('У каталозі FIXLINE можна купити клеї Ceresit.') },
      metaRu: { klei: meta('ru') },
      brands: BRANDS,
    });
    expect(rows.find(r => r.slug === 'klei')!.missingBrands).toEqual(['Lacrysil']);
  });

  it('ігнорує дрібний бренд — інакше буде шум', () => {
    const rows = auditCategories({
      categories: [cat('klei')],
      products: [
        ...Array.from({ length: 30 }, () => prod('klei', 'Ceresit')),
        prod('klei', 'Lacrysil'),
      ],
      metaUa: { klei: meta('У каталозі FIXLINE можна купити клеї Ceresit.') },
      metaRu: { klei: meta('ru') },
      brands: BRANDS,
    });
    expect(rows.find(r => r.slug === 'klei')!.missingBrands).toEqual([]);
  });

  it('бачить відставання російської версії', () => {
    const rows = auditCategories({
      categories: [cat('klei')],
      products: [prod('klei', 'Ceresit')],
      metaUa: { klei: meta('У каталозі FIXLINE можна купити клеї Ceresit.', 6) },
      metaRu: { klei: meta('ru', 3) },
      brands: BRANDS,
    });
    const row = rows.find(r => r.slug === 'klei')!;
    expect(row.gaps.ruBehind).toBe(true);
    expect(row.gaps.thinFaq).toBe(true);
  });

  it('ловить blogSlug, який веде в 404', () => {
    const withBlog = (slug: string): CategoryMeta => ({ ...meta('У каталозі FIXLINE можна купити клеї Ceresit.'), blogSlug: slug });
    const rows = auditCategories({
      categories: [cat('klei'), cat('farba')],
      products: [prod('klei', 'Ceresit'), prod('farba', 'Ceresit')],
      metaUa: { klei: withBlog('yak-vybrat-klei'), farba: withBlog('znykla-stattya') },
      metaRu: { klei: withBlog('yak-vybrat-klei'), farba: withBlog('znykla-stattya') },
      brands: BRANDS,
      blogSlugs: ['yak-vybrat-klei'],
    });
    expect(rows.find(r => r.slug === 'farba')!.deadBlogSlug).toBe('znykla-stattya');
    expect(rows.find(r => r.slug === 'farba')!.gaps.deadBlogLink).toBe(true);
    expect(rows.find(r => r.slug === 'klei')!.gaps.deadBlogLink).toBe(false);
  });

  it('без списку статей посилання не перевіряються — це не привід червонити категорію', () => {
    const rows = auditCategories({
      categories: [cat('klei')],
      products: [prod('klei', 'Ceresit')],
      metaUa: { klei: { ...meta('У каталозі FIXLINE можна купити клеї Ceresit.'), blogSlug: 'bud-yaka-stattya' } },
      metaRu: { klei: { ...meta('ru'), blogSlug: 'bud-yaka-stattya' } },
      brands: BRANDS,
    });
    expect(rows.find(r => r.slug === 'klei')!.gaps.deadBlogLink).toBe(false);
  });

  it('повністю узгоджена категорія не має жодного пробілу', () => {
    const rows = auditCategories({
      categories: [cat('klei')],
      products: Array.from({ length: 5 }, () => prod('klei', 'Ceresit')),
      metaUa: { klei: meta('У каталозі FIXLINE можна купити клеї Ceresit.', 5) },
      metaRu: { klei: meta('ru', 5) },
      brands: BRANDS,
    });
    expect(hasCategoryGap(rows.find(r => r.slug === 'klei')!)).toBe(false);
  });
});

describe('auditCategories — стандарт контенту (docs/CONTENT-STANDARD.md)', () => {
  const guide = { title: 'Як вибрати', sections: [{ h: 'Коли потрібен', p: ['Абзац про вибір матеріалу.'] }, { h: 'Де купити і скільки коштує', p: ['У FIXLINE купити можна від 1 упаковки, ціна від 100 грн.'] }] };
  const guideNoBuy = { title: 'Як вибрати', sections: [{ h: 'Коли потрібен', p: ['Абзац про вибір матеріалу без комерції.'] }] };
  const five = (slug: string) => Array.from({ length: 5 }, () => prod(slug, 'Ceresit'));

  it('немає гайда — лише при 5+ товарах і попиті ≥ 25 показів', () => {
    const rows = auditCategories({
      categories: [cat('a'), cat('b'), cat('c')],
      products: [...five('a'), ...five('b'), prod('c', 'Ceresit')],
      metaUa: { a: meta('У каталозі FIXLINE — Ceresit.', 7), b: meta('У каталозі FIXLINE — Ceresit.', 7), c: meta('У каталозі FIXLINE — Ceresit.', 7) },
      metaRu: { a: meta('ru', 7), b: meta('ru', 7), c: meta('ru', 7) },
      brands: BRANDS,
      demand: { a: { impressions: 40, topQuery: null }, b: { impressions: 5, topQuery: null }, c: { impressions: 200, topQuery: null } },
    });
    expect(rows.find(r => r.slug === 'a')!.gaps.noGuide).toBe(true);
    expect(rows.find(r => r.slug === 'b')!.gaps.noGuide).toBe(false); // попиту немає
    expect(rows.find(r => r.slug === 'c')!.gaps.noGuide).toBe(false); // 1 товар — тонка, не гайд
    expect(rows.find(r => r.slug === 'c')!.gaps.thinCategory).toBe(true);
  });

  it('гайд без «купити», рос. гайд відстає, FAQ < 7 при гайді', () => {
    const rows = auditCategories({
      categories: [cat('x')],
      products: five('x'),
      metaUa: { x: { ...meta('У каталозі FIXLINE — Ceresit.', 5), guide: guideNoBuy } },
      metaRu: { x: meta('ru', 5) },
      brands: BRANDS,
    });
    const row = rows.find(r => r.slug === 'x')!;
    expect(row.gaps.guideNoBuy).toBe(true);
    expect(row.gaps.ruGuideBehind).toBe(true);
    expect(row.gaps.thinFaq).toBe(true); // 5 < 7, бо є гайд
    expect(row.guideWords.ua).toBeGreaterThan(0);
  });

  it('повний гайд обома мовами й 7 FAQ — без міток', () => {
    const rows = auditCategories({
      categories: [cat('y')],
      products: five('y'),
      metaUa: { y: { ...meta('У каталозі FIXLINE — Ceresit.', 7), guide } },
      metaRu: { y: { ...meta('ru', 7), guide } },
      brands: BRANDS,
      demand: { y: { impressions: 100, topQuery: 'купити y' } },
    });
    const row = rows.find(r => r.slug === 'y')!;
    expect(row.gaps.noGuide).toBe(false);
    expect(row.gaps.guideNoBuy).toBe(false);
    expect(row.gaps.ruGuideBehind).toBe(false);
    expect(row.gaps.thinFaq).toBe(false);
  });

  it('H1 ≠ запит: перше значуще слово запиту має бути в назві uk або ru', () => {
    expect(nameCoversQuery(['Праймери'], 'бітумний праймер')).toBe(false);
    expect(nameCoversQuery(['Бітумні праймери'], 'бітумний праймер')).toBe(true);
    expect(nameCoversQuery(['Морилки та тонуючі засоби'], 'морилка для дерева')).toBe(true);
    expect(nameCoversQuery(['Фарби та покриття'], 'купити фарбу')).toBe(true);
    expect(nameCoversQuery(['Клей для шпалер', 'Клей для обоев'], 'клей для обоев цена')).toBe(true);
    const rows = auditCategories({
      categories: [cat('praimery', 'Праймери')],
      products: five('praimery'),
      metaUa: { praimery: { ...meta('У каталозі FIXLINE — Ceresit.', 7), guide } },
      metaRu: { praimery: { ...meta('ru', 7), guide } },
      brands: BRANDS,
      demand: { praimery: { impressions: 37, topQuery: 'бітумний праймер' } },
      namesRu: { praimery: 'Праймеры' },
    });
    expect(rows[0].gaps.h1Mismatch).toBe(true);
  });
});

describe('deadPriceSku — токени живих цін', () => {
  const cats = [{ slug: 'germetyky', name: 'Герметики', parent_slug: null }];
  const meta = { description: 'Від {min}', guide: { title: 'Гайд', sections: [{ h: 'Де купити', p: ['Ceresit — {price:CR-1}, Lacrysil — {range:LA-1,LA-9}.'] }] } };
  it('без артикулів у products перевірка не виконується', () => {
    const [row] = auditCategories({ categories: cats, products: [prod('germetyky', 'Ceresit')], metaUa: { germetyky: meta }, metaRu: {}, brands: [] });
    expect(row.gaps.deadPriceSku).toBe(false);
    expect(row.deadPriceSkus).toEqual([]);
  });
  it('артикул із токена, якого немає серед активних, — мітка', () => {
    const products = [{ ...prod('germetyky', 'Ceresit'), sku: 'CR-1' }, { ...prod('germetyky', 'Lacrysil'), sku: 'LA-1' }];
    const [row] = auditCategories({ categories: cats, products, metaUa: { germetyky: meta }, metaRu: {}, brands: [] });
    expect(row.deadPriceSkus).toEqual(['LA-9']);
    expect(row.gaps.deadPriceSku).toBe(true);
  });
});

describe('guideMissesChild — гайд хаба і його підкатегорії', () => {
  // Реальний випадок, з якого взялась перевірка: у «Сітки, стрічки, склополотно»
  // дві підкатегорії стояли порожні, і коли туди заллють товар, гайд про них
  // не дізнається — на СКЛАД гайда не дивиться жодна інша мітка.
  const tree = [
    cat('strichky', 'Стрічки'),
    cat('malyarna-strichka', 'Малярна', 'strichky'),
    cat('sklopolotno', 'Склополотно', 'strichky'),
  ];
  const fill = (slug: string, n: number) => Array.from({ length: n }, () => prod(slug, 'Сталь'));
  const guide = (...links: string[]): CategoryMeta => ({
    description: 'опис',
    seoText: 'У каталозі FIXLINE можна купити стрічки Сталь.',
    faq: Array.from({ length: 7 }, (_, i) => ({ q: `q${i}`, a: `a${i}` })),
    guide: { title: 'Яку стрічку вибрати', sections: [{ h: 'Що для якої задачі', p: [links.map(l => `[текст](${l})`).join(' ')] }] },
  });
  const run = (meta: CategoryMeta, sklopolotnoCount: number) => auditCategories({
    categories: tree,
    products: [...fill('malyarna-strichka', 12), ...fill('sklopolotno', sklopolotnoCount)],
    metaUa: { strichky: meta },
    metaRu: { strichky: meta },
    brands: BRANDS,
  }).find(r => r.slug === 'strichky')!;

  it('підкатегорія з 5+ товарами, якої немає в гайді, — мітка', () => {
    const row = run(guide('/shop/malyarna-strichka'), 8);
    expect(row.unlinkedChildren).toEqual(['sklopolotno']);
    expect(row.gaps.guideMissesChild).toBe(true);
  });

  it('усі підкатегорії в гайді — мітки немає', () => {
    const row = run(guide('/shop/malyarna-strichka', '/shop/sklopolotno'), 8);
    expect(row.unlinkedChildren).toEqual([]);
    expect(row.gaps.guideMissesChild).toBe(false);
  });

  it('посилання в «Дивіться також» рахується нарівні з прозою', () => {
    const meta = { ...guide('/shop/malyarna-strichka'), related: [{ href: '/shop/sklopolotno', label: 'Склополотно' }] };
    expect(run(meta, 8).gaps.guideMissesChild).toBe(false);
  });

  it('тонку підкатегорію не вимагаємо: стандарт 1.1 її й не радить розкривати', () => {
    expect(run(guide('/shop/malyarna-strichka'), 4).gaps.guideMissesChild).toBe(false);
    // а порожню — тим паче
    expect(run(guide('/shop/malyarna-strichka'), 0).gaps.guideMissesChild).toBe(false);
  });

  it('без гайда перевірка не виконується — там працює мітка «немає гайда»', () => {
    const row = run(meta('У каталозі FIXLINE можна купити стрічки Сталь.', 7), 8);
    expect(row.gaps.guideMissesChild).toBe(false);
    expect(row.unlinkedChildren).toEqual([]);
  });
});
