import { describe, it, expect } from 'vitest';
import { googleProductCategoryId } from '../lib/google-product-category';

// Фід Merchant Center: атрибут або правильний, або відсутній — помилковий
// гірший за жоден, бо Google матчить товар не з тими запитами.
describe('googleProductCategoryId', () => {
  it('дочірня категорія зі своїм записом бере його', () => {
    expect(googleProductCategoryId('morylky', 'zakhyst-derevyny')).toBe(1648);
  });
  it('дочірня без запису бере батьківську', () => {
    expect(googleProductCategoryId('sylikonovi-germetyky', 'germetyky')).toBe(503744);
  });
  it('кожна коренева родина каталогу має відповідник', () => {
    const roots = ['germetyky', 'montazhna-pina', 'klei', 'hidroizolyatsiya', 'gruntivky', 'farby',
      'zakhyst-derevyny', 'plastyfikatory', 'zamazky-dlya-shviv', 'vologopoglinachi', 'instrumenty', 'kriplennya', 'strichky'];
    for (const r of roots) expect(googleProductCategoryId(r, null), r).not.toBeNull();
  });
  it('онука (алкідні 3в1 → фарби 3 в 1 → фарби) не лишається без ID', () => {
    expect(googleProductCategoryId('farby-3v1-alkidni', 'farby-3v1')).toBe(1361);
  });
  it('невідома категорія без батька — null, а не вигаданий ID', () => {
    expect(googleProductCategoryId('nova-kategoriya', null)).toBeNull();
    expect(googleProductCategoryId(null, null)).toBeNull();
  });
});
