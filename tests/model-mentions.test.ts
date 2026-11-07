import { describe, it, expect } from 'vitest';
import { goneModelMentions, type MentionProduct } from '../lib/seo/model-mentions';
import { auditCategories } from '../lib/seo/category-audit';
import { buildGuideStalenessMessage } from '../lib/seo/guide-staleness';

const all: MentionProduct[] = [
  { name: 'Шпатлівка Knauf Super Finish пастоподібна, 28 кг', brand: 'Knauf', active: false },
  { name: 'Шпатлівка Siltek Acril Finish акрилова фінішна, 15 кг', brand: 'Siltek', active: true },
  { name: 'Шпатлівка по дереву Дивоцвіт G4, 500 г', brand: 'Дивоцвіт', active: false },
  { name: 'Шпатлівка по дереву Дивоцвіт G4, 700 г', brand: 'Дивоцвіт', active: true },
  { name: "Піна-клей Lacrysil побутова '60 секунд' 800 мл", brand: 'Lacrysil', active: false },
];
const text = 'У каталозі FIXLINE можна купити готові шпаклівки у відрах — Knauf Super Finish 28 кг і Siltek Acril Finish 15 кг, а також Дивоцвіт G4 для тріщин. Ceresit для ванної теж є; Lacrysil «60 секунд» — піна-клей.';

describe('goneModelMentions — опис називає знятий товар (07.11.2026)', () => {
  it('лише моделі, що збігаються тільки з неактивними товарами', () => {
    expect(goneModelMentions(text, all)).toEqual(['Knauf Super Finish', 'Lacrysil «60 секунд»']);
  });
  it('хоч один варіант моделі ще продається — не мертве («Дивоцвіт G4»)', () => {
    expect(goneModelMentions('Дивоцвіт G4 для тріщин', all)).toEqual([]);
  });
  it('без збігу з назвою — це опис, а не модель («Ceresit для ванної»)', () => {
    expect(goneModelMentions('Ceresit для ванної', [...all, { name: 'Ceresit CE 40', brand: 'Ceresit', active: false }])).toEqual([]);
  });
});

describe('аудит і зведення: опис категорії', () => {
  it('seoGoneProducts + рядки «опис:» у зведенні', () => {
    const rows = auditCategories({
      categories: [{ slug: 'shpaklivky', name: 'Шпаклівки', parent_slug: null }],
      products: [{ sku: 'S-1', category_slug: 'shpaklivky', brand: 'Siltek', name: 'Шпатлівка Siltek Acril Finish', created_at: null }],
      metaUa: { shpaklivky: { description: 'Шпаклівки.', seoText: text } },
      metaRu: {},
      brands: ['Siltek'],
      knownBrands: ['Siltek', 'Knauf', 'Дивоцвіт', 'Lacrysil'],
      allProducts: all,
    });
    const r = rows.find(x => x.slug === 'shpaklivky')!;
    expect(r.seoGoneProducts).toEqual(['Knauf Super Finish', 'Lacrysil «60 секунд»']);
    expect(r.gaps.seoGoneProduct).toBe(true);
    const msg = buildGuideStalenessMessage(rows, 'https://fixline.com.ua')!;
    expect(msg).toContain('⛔ <a href="https://fixline.com.ua/admin/seo/categories/shpaklivky#seo-text">опис</a>: знято з продажу — Knauf Super Finish, Lacrysil «60 секунд»');
  });
});
