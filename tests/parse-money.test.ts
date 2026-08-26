import { describe, it, expect } from 'vitest';
import { parseMoney } from '../lib/parse-money';

// Живий випадок 26.08: у вікні оплати постачальнику в поле «Сума» вставили
// 52 077,80 — рівно так, як воно показане в підсумковому рядку. parseFloat
// прочитав 52, і рознесення на 83 накладні відхилилось як «більше за оплату».
describe('parseMoney', () => {
  it('читає суму з роздільником тисяч у будь-якому вигляді пробілу', () => {
    expect(parseMoney('52 077,80')).toBe(52077.8);              // звичайний пробіл
    expect(parseMoney('52 077,80')).toBe(52077.8);         // нерозривний — саме такий дає uk-UA toLocaleString
    expect(parseMoney('52 077,80')).toBe(52077.8);         // вузький нерозривний
    expect(parseMoney("52'077.80")).toBe(52077.8);              // апостроф
  });

  it('приймає і кому, і крапку як роздільник копійок', () => {
    expect(parseMoney('300,50')).toBe(300.5);
    expect(parseMoney('300.50')).toBe(300.5);
    expect(parseMoney('1 234 567,89')).toBe(1234567.89);
  });

  it('ціле число лишається цілим', () => {
    expect(parseMoney('300')).toBe(300);
    expect(parseMoney('1 000')).toBe(1000);
    expect(parseMoney(76260.9)).toBe(76260.9);
  });

  it('останній роздільник — це копійки, попередні ділять тисячі', () => {
    expect(parseMoney('1.234,56')).toBe(1234.56);           // німецький формат
    expect(parseMoney('1,234.56')).toBe(1234.56);           // англійський формат
  });

  it('порожнє й несуразне дає NaN, а не тихий нуль', () => {
    expect(parseMoney('')).toBeNaN();
    expect(parseMoney(null)).toBeNaN();
    expect(parseMoney(undefined)).toBeNaN();
    expect(parseMoney('abc')).toBeNaN();
  });
});
