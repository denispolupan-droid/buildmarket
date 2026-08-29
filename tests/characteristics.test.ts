import { describe, it, expect } from 'vitest';
import { normalizeChars, normCharKey, type CharDictionary } from '../lib/characteristics';
import { buildValueRules } from '../lib/char-values';

function dict(): CharDictionary {
  const defs: [string, string[], boolean, number][] = [
    ['Тип', ['тип продукту'], false, 10],
    ['Ступінь блиску', ['блиск'], false, 210],
    ['Область застосування', ['застосування'], true, 320],
    ['Розведення', ['розведення водою'], false, 410],
    ["Об'єм", ["об'єм балону"], false, 700],
    ['Бренд', [], false, 900],
    ['Країна виробника', ['країна виробник'], false, 910],
  ];
  const aliasMap = new Map<string, string>();
  const multiselect = new Set<string>();
  const sortMap = new Map<string, number>();
  for (const [label, aliases, multi, sort] of defs) {
    aliasMap.set(normCharKey(label), label);
    for (const a of aliases) aliasMap.set(normCharKey(a), label);
    if (multi) multiselect.add(label);
    sortMap.set(label, sort);
  }
  const values = buildValueRules([
    { label: 'Ступінь блиску', value: 'Матовий', match_patterns: ['^мат'] },
    { label: 'Ступінь блиску', value: 'Глянцевий', category_slugs: ['farby'], match_patterns: ['глянц'] },
  ]);
  const parentOf = new Map<string, string | null>([['farby', null], ['laky', 'farby']]);
  return { aliasMap, multiselect, sortMap, values, parentOf };
}

describe('normalizeChars — канонізація, дедуп, порядок', () => {
  it('зводить синоніми до канонічного лейбла, перше входження виграє', () => {
    const out = normalizeChars([
      { label: 'Розведення', value: '1:10 (водою)' },
      { label: 'Розведення водою', value: '1 частина концентрату : 10 частин води' },
    ], dict());
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe('Розведення');
    expect(out[0].value).toBe('1:10 (водою)');
  });

  it('уніфікує апостроф (гравіс → апостроф) і зливає дублі', () => {
    const out = normalizeChars([
      { label: "Об'єм", value: '1 л' },
      { label: 'Об`єм', value: '1000' },
    ], dict());
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("Об'єм");
    expect(out[0].value).toBe('1 л'); // значення з одиницею інформативніше за голе число
  });

  it('голе число програє значенню з одиницею незалежно від порядку', () => {
    const out = normalizeChars([
      { label: 'Об`єм', value: '1000' },
      { label: "Об'єм", value: '1 л' },
    ], dict());
    expect(out[0].value).toBe('1 л');
  });

  it('multiselect: кілька рядків зливаються через "; ", кожен рядок атомарний', () => {
    const out = normalizeChars([
      { label: 'Область застосування', value: 'Ванна кімната' },
      { label: 'Застосування', value: 'Кухня' },
      { label: 'Область застосування', value: 'Ванна кімната' },
    ], dict());
    expect(out).toHaveLength(1);
    expect(out[0].value).toBe('Ванна кімната; Кухня');
  });

  it('порядок за словником: Тип → Блиск → Бренд/Країна в кінці; невідомі перед Брендом', () => {
    const out = normalizeChars([
      { label: 'Бренд', value: 'Eskaro' },
      { label: 'Щось нестандартне', value: 'значення' },
      { label: 'Блиск', value: 'Матовий' },
      { label: 'Тип продукту', value: 'Фарба' },
    ], dict());
    expect(out.map(c => c.label)).toEqual(['Тип', 'Ступінь блиску', 'Щось нестандартне', 'Бренд']);
    expect(out.map(c => c.sort_order)).toEqual([1, 2, 3, 4]);
  });

  it('порожні лейбли/значення відкидаються', () => {
    const out = normalizeChars([
      { label: '', value: 'x' },
      { label: 'Тип', value: '  ' },
      { label: 'Тип', value: 'Фарба' },
    ], dict());
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ label: 'Тип', value: 'Фарба', sort_order: 1 });
  });

  it('значення фасетів канонізуються за довідником з урахуванням родини категорії', () => {
    const chars = [{ label: 'Блиск', value: 'матова' }, { label: 'Тип', value: 'глянцева емаль' }];
    // глобальне правило (Матовий) — без категорії; «глянц» — лише у farby і підкатегоріях
    expect(normalizeChars([{ label: 'Блиск', value: 'глянцева' }], dict())[0].value).toBe('глянцева');
    expect(normalizeChars([{ label: 'Блиск', value: 'глянцева' }], dict(), 'laky')[0].value).toBe('Глянцевий');
    const out = normalizeChars(chars, dict());
    expect(out.find(c => c.label === 'Ступінь блиску')!.value).toBe('Матовий');
    expect(out.find(c => c.label === 'Тип')!.value).toBe('глянцева емаль'); // чужий лейбл — без змін
  });

  it('одиночний вільнотекстовий multiselect-рядок з комами лишається без змін', () => {
    const out = normalizeChars([
      { label: 'Область застосування', value: "Дерев'яні конструкції: стропила, балки, брус" },
    ], dict());
    expect(out[0].value).toBe("Дерев'яні конструкції: стропила, балки, брус");
  });
});
