import { describe, it, expect } from 'vitest';
import { sanitizeNpNote } from '../lib/np-api';

// Правила зняті з живого API НП (AdditionalService.save по неіснуючій ТТН —
// поля валідуються, але заявка не створюється): «Note is incorrect» дають
// латинські літери, «#» і «:».
describe('sanitizeNpNote', () => {
  it('прибирає решітку, на якій падала заявка', () => {
    expect(sanitizeNpNote('Повернення по замовленню #26071048')).toBe('Повернення по замовленню 26071048');
  });

  it('прибирає латиницю і двокрапку', () => {
    expect(sanitizeNpNote('Return: Повернення')).toBe('Повернення');
    expect(sanitizeNpNote('Замовлення: 26071048')).toBe('Замовлення 26071048');
  });

  it('зберігає кирилицю, цифри й дозволену пунктуацію', () => {
    expect(sanitizeNpNote('Повернення, замовлення 26071048 - відмова / «Їжак» ґудзик.'))
      .toBe('Повернення, замовлення 26071048 - відмова / «Їжак» ґудзик.');
  });

  it('нормалізує прямий апостроф у типографський', () => {
    expect(sanitizeNpNote("Об'єкт")).toBe('Об’єкт');
  });

  it('схлопує пробіли, що лишилися від вирізаних символів', () => {
    expect(sanitizeNpNote('Повернення ### замовлення')).toBe('Повернення замовлення');
  });

  it('віддає порожній рядок, коли чистити нічого', () => {
    expect(sanitizeNpNote('Return order')).toBe('');
    expect(sanitizeNpNote('   ')).toBe('');
  });

  it('обрізає до 200 символів', () => {
    expect(sanitizeNpNote('я'.repeat(300))).toHaveLength(200);
  });
});
