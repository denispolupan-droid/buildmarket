import { describe, it, expect } from 'vitest';
import { canonicalVolume, majority, matchBrand, mostCommon, validateProposal } from '../lib/product-card-rules';

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
