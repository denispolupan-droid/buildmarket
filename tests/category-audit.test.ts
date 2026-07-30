import { describe, it, expect } from 'vitest';
import { auditCategories, catalogSentence, hasCategoryGap } from '../lib/seo/category-audit';
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
