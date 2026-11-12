import { describe, it, expect } from 'vitest';
import { mapEpicentrAttributes, paintDensity, toUnit, MASS_VOLUME_SETS } from '../lib/epicentr-attributes';

/**
 * Фарби (набір 3198): Епіцентр вимагає і «Об'єм», і «Вагу», select-и — зі
 * словника. Щільності погоджені власником 10.11.2026; до 12.11 фід ставив кг = л
 * і select-и лишались порожні (125/58 карток), правило жило лише в разовому XML.
 */
const pick = (name: string, volume: string) => Object.fromEntries(
  mapEpicentrAttributes('3198', { name, volume }).params
    .filter(p => ['104', '762', '14933', '14934'].includes(p.code)).map(p => [p.code, p.value]),
);

describe('фарби: маса ↔ об\'єм зі щільністю', () => {
  it('щільності: водна 1,45, алкід/емаль 1,25, лак/лазур 1,0', () => {
    expect(paintDensity('Фарба інтер\'єрна акрилова')).toBe(1.45);
    expect(paintDensity('Емаль ПФ-115 біла')).toBe(1.25);
    expect(paintDensity('Лазур для деревини')).toBe(1.0);
  });
  it('14 кг водної фарби → 9,6 л (не 14 л)', () => {
    const r = pick('Фарба Polifarb Акрилбет для бетону, 14 кг', '14 кг');
    expect(r['762']).toBe('14');
    expect(Number(r['104'])).toBeCloseTo(9.655, 2);
    expect(r['14934']).toMatch(/л$/);
    expect(r['14933']).toBe('14 кг');
  });
  it('10 л → вага 14,5 кг і select «Вага» найближчий у межах 20 %', () => {
    const r = pick('Фарба інтер\'єрна Sniezka 10 л', '10 л');
    expect(Number(r['762'])).toBeCloseTo(14.5, 2);
    expect(r['14934']).toBe('10 л');
    expect(r['14933']).toMatch(/кг$/);
  });
  it('інші набори — як раніше (щільність 1)', () => {
    expect(MASS_VOLUME_SETS).toEqual(['3198']);
    expect(toUnit('2 кг', 'л', '')).toBe(2);
    expect(toUnit('2 кг', 'л', '', 1.25)).toBe(1.6);
  });
});
