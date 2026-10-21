import { describe, it, expect } from 'vitest';
import { shortFio } from '../lib/signatory';

describe('shortFio', () => {
  it('скорочує повне ПІБ до «Прізвище І. Б.»', () => {
    expect(shortFio('Похальчук Ігор Дмитрович')).toBe('Похальчук І. Д.');
    expect(shortFio('Полупан Денис Олександрович')).toBe('Полупан Д. О.');
  });

  it('прізвище + ім’я без по батькові', () => {
    expect(shortFio('Іваненко Іван')).toBe('Іваненко І.');
  });

  it('уже скорочене чи нестандартне лишає як є', () => {
    expect(shortFio('Іваненко І. І.')).toBe('Іваненко І. І.');
    expect(shortFio('Іваненко')).toBe('Іваненко');
    expect(shortFio('Голова правління Іваненко Іван Іванович')).toBe('Голова правління Іваненко Іван Іванович');
  });

  it('порожнє → порожній рядок', () => {
    expect(shortFio(null)).toBe('');
    expect(shortFio('  ')).toBe('');
  });
});
