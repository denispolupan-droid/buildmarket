import { describe, it, expect } from 'vitest';
import { canonicalVolume, majority, matchBrand, mostCommon, parsePackageMm, proposeMarkups, validateProposal } from '../lib/product-card-rules';

describe('majority', () => {
  it('більшість сусідів вирішує; без сусідів — fallback', () => {
    expect(majority([true, true, false], false)).toBe(true);
    expect(majority([false, false, true], true)).toBe(false);
    expect(majority([null, undefined], true)).toBe(true);
  });
});

describe('matchBrand', () => {
  it('знаходить бренд каталогу без огляду на регістр і пробіли', () => {
    expect(matchBrand('ceresit', ['Ceresit', 'Lacrysil'])).toEqual({ brand: 'Ceresit', isNew: false });
    expect(matchBrand('  Aqua  Protect ', ['Aqua Protect'])).toEqual({ brand: 'Aqua Protect', isNew: false });
  });
  it('невідомий бренд повертає як є з позначкою isNew', () => {
    expect(matchBrand('Soudal', ['Ceresit'])).toEqual({ brand: 'Soudal', isNew: true });
    expect(matchBrand('', ['Ceresit'])).toEqual({ brand: '', isNew: false });
  });
});

describe('mostCommon', () => {
  it('найчастіше значення, порожні ігноруються', () => {
    expect(mostCommon(['tube', null, 'canister', 'tube', undefined])).toBe('tube');
    expect(mostCommon([])).toBeNull();
  });
});

// Фасування в каталозі пишеться «280 мл», «5 кг»; дробові літри — у мл.
describe('canonicalVolume', () => {
  it('нормалізує одиниці й латиницю', () => {
    expect(canonicalVolume('280ml')).toBe('280 мл');
    expect(canonicalVolume('0,75 л')).toBe('750 мл');
    expect(canonicalVolume('5 kg')).toBe('5 кг');
    expect(canonicalVolume('0.5 кг')).toBe('500 г');
    expect(canonicalVolume('2,5 л')).toBe('2,5 л');
  });
  it('нерозпізнане → null', () => {
    expect(canonicalVolume('великий')).toBeNull();
    expect(canonicalVolume(null)).toBeNull();
  });
});

describe('validateProposal', () => {
  const ctx = { categorySlugs: new Set(['sylikonovi-germetyky']), requiredLabels: ['Колір', 'Основа'] };
  it('чиста пропозиція — без зауважень', () => {
    const issues = validateProposal({
      name: 'Ceresit CS 25 Силіконовий герметик білий, 280 мл', brand: 'Ceresit', category_slug: 'sylikonovi-germetyky', volume: '280 мл',
      characteristics: [{ label: 'Колір', value: 'Білий' }, { label: 'Основа', value: 'Силікон' }],
    }, ctx);
    expect(issues).toEqual([]);
  });
  it('ловить назву без бренду й фасування, чужу категорію і пропущені обовʼязкові', () => {
    const issues = validateProposal({
      name: 'Герметик', brand: 'Ceresit', category_slug: 'nema-takoi', volume: '280 мл',
      characteristics: [{ label: 'Колір', value: 'Білий' }],
    }, ctx);
    const fields = issues.map(i => i.field);
    expect(fields).toContain('name');
    expect(fields).toContain('category_slug');
    expect(issues.find(i => i.field === 'characteristics')?.message).toContain('Основа');
  });
});

describe('proposeMarkups — націнки нової картки', () => {
  it('як у лінійки; Епіцентр = Prom (рішення 11.11)', () => {
    expect(proposeMarkups({ prom_markup_pct: '21.4', rozetka_markup_pct: '12.00' }, []))
      .toEqual({ prom_markup_pct: 21.4, rozetka_markup_pct: 12, epicentr_markup_pct: 21.4, source: 'sibling' });
  });
  it('без лінійки — медіана категорії (null не рахуємо)', () => {
    const n = [{ prom_markup_pct: 20, rozetka_markup_pct: 10 }, { prom_markup_pct: 25, rozetka_markup_pct: 12 }, { prom_markup_pct: null, rozetka_markup_pct: null }, { prom_markup_pct: 30, rozetka_markup_pct: 11 }];
    expect(proposeMarkups(null, n)).toEqual({ prom_markup_pct: 25, rozetka_markup_pct: 11, epicentr_markup_pct: 25, source: 'category' });
  });
  it('нема ні лінійки, ні сусідів з націнкою — none (форма попередить)', () => {
    expect(proposeMarkups({ prom_markup_pct: null, rozetka_markup_pct: null }, [{ prom_markup_pct: null, rozetka_markup_pct: null }]).source).toBe('none');
  });
});

describe('parsePackageMm', () => {
  it('різні записи габаритів', () => {
    expect(parsePackageMm('230x55x55')).toEqual([230, 55, 55]);
    expect(parsePackageMm('310 × 65 × 65 мм')).toEqual([310, 65, 65]);
    expect(parsePackageMm('')).toBeNull();
    expect(parsePackageMm('230x55')).toBeNull();
  });
});
