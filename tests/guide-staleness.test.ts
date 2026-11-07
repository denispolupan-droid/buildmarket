import { describe, it, expect } from 'vitest';
import { auditCategories } from '../lib/seo/category-audit';
import { buildGuideStalenessMessage } from '../lib/seo/guide-staleness';
import type { CategoryMeta } from '../lib/category-descriptions';

const now = new Date('2026-11-07T10:00:00Z');
const guide = (p: string[]): CategoryMeta => ({
  description: 'd',
  guide: { title: 'Як вибрати піну', sections: [{ h: 'Види', p }, { h: 'Де купити', p: ['У FIXLINE піна {brands} коштує від {min}. Зараз у наявності: {top:3}.'] }] },
});
const categories = [{ slug: 'pina', name: 'Монтажна піна', parent_slug: null }];
const products = [
  { sku: 'A-1', category_slug: 'pina', brand: 'Akfix', name: 'Піна Akfix 805', created_at: '2026-11-01T00:00:00Z' },
  { sku: 'A-2', category_slug: 'pina', brand: 'Akfix', name: 'Піна Akfix 840', created_at: '2026-01-01T00:00:00Z' },
  { sku: 'C-1', category_slug: 'pina', brand: 'Ceresit', name: 'Піна Ceresit TS 62', created_at: '2026-01-01T00:00:00Z' },
];

function audit(meta: CategoryMeta) {
  return auditCategories({
    categories, products, metaUa: { pina: meta }, metaRu: {},
    brands: ['Akfix', 'Ceresit'], knownBrands: ['Akfix', 'Ceresit', 'Lacrysil'], now,
  });
}

describe('застарілі гайди (07.11.2026)', () => {
  it('бренд, якого в категорії вже немає, і посилання на знятий товар — «гайд застарів»', () => {
    const [r] = audit(guide(['[Lacrysil «60 секунд»](/product/1802-002) майже не розширюється, а Ceresit TS 62 — для вікон.']));
    expect(r.guideStaleBrands).toEqual(['Lacrysil']);
    expect(r.guideDeadLinks).toEqual([{ sku: '1802-002', label: 'Lacrysil «60 секунд»' }]);
    expect(r.gaps.guideStale).toBe(true);
  });
  it('назва лінійки після бренду («Ceresit Lacrysil…») — не бренд', () => {
    const [r] = audit(guide(['Ceresit Lacrysil-подібна серія, Akfix 805.']));
    expect(r.guideStaleBrands).toEqual([]);
  });
  it('бренд без згадки (перелік {brands} не рахується) і нові товари за 30 днів без посилання', () => {
    const [r] = audit(guide(['Ceresit TS 62 — для вікон.']));
    expect(r.guideMissingBrands).toEqual([{ brand: 'Akfix', count: 2 }]);
    expect(r.newProducts.map(p => p.sku)).toEqual(['A-1']);
    expect(r.gaps.guideMissing).toBe(true);
    expect(r.gaps.guideStale).toBe(false);
  });
  it('усе згадано й на місці — без зауважень', () => {
    const [r] = audit(guide(['[Akfix 805](/product/A-1) і Akfix 840; Ceresit TS 62 — для вікон.']));
    expect(r.gaps.guideStale).toBe(false);
    expect(r.gaps.guideMissing).toBe(false);
  });
  it('зведення: назва-посилання в редактор, рядки по пунктах; нічого — null', () => {
    const rows = audit(guide(['[Lacrysil «60 секунд»](/product/1802-002) і Ceresit TS 62.']));
    const msg = buildGuideStalenessMessage(rows, 'https://fixline.com.ua')!;
    expect(msg).toContain('href="https://fixline.com.ua/admin/seo/categories/pina">Монтажна піна</a>');
    expect(msg).toContain('<a href="https://fixline.com.ua/shop/pina">на сайті</a>');
    // «гайд» у кожному рядку — посилання на розділ гайда в редакторі
    const g = '<a href="https://fixline.com.ua/admin/seo/categories/pina#guide">гайд</a>';
    expect(msg).toContain(`⛔ ${g}: бренду вже немає — Lacrysil`);
    expect(msg).toContain(`⛔ ${g}: знято з продажу — Lacrysil «60 секунд»`);
    expect(msg).toContain(`➕ ${g}: бренди без згадки — Akfix (2)`);
    expect(msg).toContain(`🆕 ${g}: нові товари без згадки — Піна Akfix 805`);
    expect(buildGuideStalenessMessage(audit(guide(['[Akfix 805](/product/A-1), Akfix, Ceresit.'])), 'x')).toBeNull();
  });
});
