import { describe, it, expect } from 'vitest';
import { compareAttributeSets } from '../lib/epicentr-attributes-watch';

const snap = [{ code: '3198', title: 'Фарба', attributes: [
  { code: '104', required: true, system: false, title: "Об'єм" },
  { code: '9993', required: false, system: false, title: 'Колір' },
  { code: 'brand', required: true, system: true, title: 'Бренд' },
] }];
const live = (attrs: { code: string; isRequired: boolean; isSystem?: boolean; title?: string }[]) => [{
  code: '3198', attributes: attrs.map(a => ({ code: a.code, type: 'select', isSystem: !!a.isSystem, isRequired: a.isRequired, translations: [{ languageCode: 'ua', title: a.title ?? a.code }] })),
}];

describe('сторож довідника атрибутів Епіцентру', () => {
  it('без змін — порожньо (системні ігноруємо)', () => {
    expect(compareAttributeSets(snap, live([{ code: '104', isRequired: true }, { code: '9993', isRequired: false }, { code: 'brand', isRequired: false, isSystem: true }]))).toEqual([]);
  });
  it('нове обовʼязкове, стало обовʼязковим, прибрано', () => {
    const d = compareAttributeSets(snap, live([{ code: '9993', isRequired: true }, { code: '14933', isRequired: true, title: 'Вага' }]));
    expect(d.map(x => `${x.code}:${x.kind}`).sort()).toEqual(['104:removed', '14933:new_required', '9993:became_required']);
  });
  it('набору більше немає', () => {
    expect(compareAttributeSets(snap, [])[0].kind).toBe('set_missing');
  });
});
