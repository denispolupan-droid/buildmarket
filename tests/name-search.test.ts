import { describe, it, expect } from 'vitest';
import { fold, nameFragments, NAME_STEMS } from '../lib/name-search';

describe('fold — орфографія', () => {
  it('зводить і/ї/ы, є/е/э/ё, ґ/г до одного вигляду', () => {
    expect(fold('Лисенко')).toBe(fold('Лысенко'));
    expect(fold('Сергієнко')).toBe(fold('Сергиенко'));
    expect(fold('Артем')).toBe(fold('Артём'));
    expect(fold('Ірина')).toBe(fold('Ирина'));
    expect(fold('Юрій')).toBe(fold('Юрий'));
    expect(fold('Ґудзь')).toBe('гудз');
  });

  it('знімає апостроф, дефіс і м\'який знак', () => {
    expect(fold("Дем'яненко")).toBe(fold('Демяненко'));
    expect(fold('Петренко-Коваль')).toBe('петренкоковал');
    expect(fold('Василь')).toBe('васил');
  });

  it('не плутає різні прізвища', () => {
    expect(fold('Коваленко')).not.toBe(fold('Ковальчук'));
    expect(fold('Петренко')).not.toBe(fold('Петришин'));
  });
});

describe('nameFragments — корені імен', () => {
  it('українське й російське написання дають ті самі фрагменти', () => {
    expect(nameFragments('Олександр')).toEqual(nameFragments('Александр'));
    expect(nameFragments('Микола')).toEqual(nameFragments('Николай'));
    expect(nameFragments('Тетяна')).toEqual(nameFragments('Татьяна'));
    expect(nameFragments('Світлана')).toEqual(nameFragments('Светлана'));
  });

  it('по батькові підтягується тим самим коренем', () => {
    expect(nameFragments('Олексійович')).toEqual(nameFragments('Алексеевич'));
    expect(nameFragments('Олександрівна')).toEqual(nameFragments('Александровна'));
  });

  it('закінчення не заважає: Дмитро / Дмитрий, Павло / Павел', () => {
    expect(nameFragments('Дмитро')).toEqual(['дмитр']);
    expect(nameFragments('Дмитрий')).toEqual(['дмитр']);
    expect(nameFragments('Павло')).toEqual(['павл', 'павел']);
    expect(nameFragments('Павел')).toEqual(['павл', 'павел']);
  });

  it('прізвище від імені не вважається іменем', () => {
    // інакше «Сергієнко» шукало б усіх Сергіїв, а «Петренко» — усіх Петрів
    expect(nameFragments('Сергієнко')).toEqual(['сергиенко']);
    expect(nameFragments('Петренко')).toEqual(['петренко']);
    expect(nameFragments('Павленко')).toEqual(['павленко']);
    expect(nameFragments('Василенко')).toEqual(['василенко']);
  });

  it('звичайне слово — просто згорнуте написання', () => {
    expect(nameFragments('Стельмах')).toEqual(['стелмах']);   // ь знято нормалізацією
    expect(nameFragments('Лысенко')).toEqual(['лисенко']);
    expect(nameFragments('')).toEqual([]);
  });

  it('корені не перетинаються між групами', () => {
    const seen = new Set<string>();
    for (const group of NAME_STEMS) {
      for (const stem of group) {
        expect(stem, `корінь ${stem} повторюється`).not.toBe('');
        expect(seen.has(stem), `корінь ${stem} у двох групах`).toBe(false);
        seen.add(stem);
      }
    }
  });

  it('корені вже згорнуті — fold на них нічого не змінює', () => {
    for (const group of NAME_STEMS) {
      for (const stem of group) expect(fold(stem), `корінь ${stem}`).toBe(stem);
    }
  });
});
