import { describe, it, expect } from 'vitest';
import { resolveProductLinks, linkBrandsInSection, resolveGuideLinks } from '../lib/seo/guide-links';

const products = [
  { sku: '1005-025', slug: 'shov-sylikonovyi-ceresit-cs-25', brand: 'Ceresit' },
  { sku: '1804-002', slug: null, brand: 'Lacrysil' },
  { sku: '1000-008', slug: 'pattex-hightack', brand: 'Pattex' },
];
const bySku = new Map(products.map(p => [p.sku, p]));
const brands = ['Ceresit', 'Lacrysil', 'Pattex', 'Aura', 'Дивоцвіт', 'Сталь', 'Aqua Protect'];

describe('resolveProductLinks — посилання на товар за артикулом', () => {
  it('артикул → канонічний слаг; без слага — артикул', () => {
    expect(resolveProductLinks('Беріть [Ceresit CS 25](/product/1005-025).', bySku))
      .toBe('Беріть [Ceresit CS 25](/product/shov-sylikonovyi-ceresit-cs-25).');
    expect(resolveProductLinks('[піна](/product/1804-002)', bySku)).toBe('[піна](/product/1804-002)');
  });
  it('знятий товар — лишається текст без посилання', () => {
    expect(resolveProductLinks('Або [Soudal Genius](/product/9999-001) — дорожче.', bySku)).toBe('Або Soudal Genius — дорожче.');
  });
  it('посилання на категорії не чіпає', () => {
    expect(resolveProductLinks('[MS-полімер](/shop/ms-polymerni-hermetyky)', bySku)).toBe('[MS-полімер](/shop/ms-polymerni-hermetyky)');
  });
});

describe('linkBrandsInSection — перше згадування бренду', () => {
  it('лише перше в розділі, навіть через кілька абзаців', () => {
    const out = linkBrandsInSection(['Ceresit CS 24 і ще Ceresit CS 25.', 'Знову Ceresit.'], brands);
    expect(out[0]).toBe('[Ceresit](/shop/brand/ceresit) CS 24 і ще Ceresit CS 25.');
    expect(out[1]).toBe('Знову Ceresit.');
  });
  it('без урахування регістру, текст лишається як написано', () => {
    expect(linkBrandsInSection(['Ґрунтовка AURA BioBlock'], brands)[0]).toBe('Ґрунтовка [AURA](/shop/brand/aura) BioBlock');
  });
  it('кирилиця з межами слова; «Сталь» не лінкується', () => {
    const [a] = linkBrandsInSection(['Дивоцвіт К4 проти цвілі. Сталь не іржавіє.'], brands);
    expect(a).toBe('[Дивоцвіт](/shop/brand/dyvotsvit) К4 проти цвілі. Сталь не іржавіє.');
    expect(linkBrandsInSection(['Дивоцвіту не було'], brands)[0]).toBe('Дивоцвіту не було');
  });
  it('не всередині посилань і токенів; якщо бренд уже в посиланні розділу — пропуск', () => {
    const [a] = linkBrandsInSection(['[Pattex HighTack](/product/1000-008) або Pattex 6 в 1 за {price:1000-008}'], brands);
    expect(a).toBe('[Pattex HighTack](/product/1000-008) або Pattex 6 в 1 за {price:1000-008}');
    const [b] = linkBrandsInSection(['див. [клеї Lacrysil](/shop/montazhnyi-klei), а Ceresit — ні'], brands);
    expect(b).toBe('див. [клеї Lacrysil](/shop/montazhnyi-klei), а [Ceresit](/shop/brand/ceresit) — ні');
  });
  it('довша назва бренду має пріоритет', () => {
    expect(linkBrandsInSection(['Просочення Aqua Protect'], [...brands, 'Aqua'])[0]).toBe('Просочення [Aqua Protect](/shop/brand/aqua-protect)');
  });
});

describe('resolveGuideLinks', () => {
  it('товари й бренди в кожному розділі окремо; мета без гайда — без змін', () => {
    const meta = {
      description: 'd',
      guide: { title: 't', sections: [
        { h: 'A', p: ['[Ceresit CS 25](/product/1005-025) і Lacrysil санітарний'] },
        { h: 'B', p: ['Lacrysil знову, Ceresit теж'] },
      ] },
    };
    const out = resolveGuideLinks(meta, products);
    expect(out.guide!.sections[0].p[0]).toBe('[Ceresit CS 25](/product/shov-sylikonovyi-ceresit-cs-25) і [Lacrysil](/shop/brand/lacrysil) санітарний');
    expect(out.guide!.sections[1].p[0]).toBe('[Lacrysil](/shop/brand/lacrysil) знову, [Ceresit](/shop/brand/ceresit) теж');
    expect(resolveGuideLinks({ description: 'd' }, products)).toEqual({ description: 'd' });
  });
});
