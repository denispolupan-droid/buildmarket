import { describe, it, expect } from 'vitest';
import { stripCityPrefix } from '../lib/orders/delivery-line';

describe('stripCityPrefix', () => {
  it('прибирає місто з адреси Нової Пошти', () => {
    expect(stripCityPrefix(
      'м. Київ (Київська обл.), №447: вул. Велика Васильківська, 143/2 (заїзд вул. Маккейна)',
      'м. Київ (Київська обл.)',
    )).toBe('№447: вул. Велика Васильківська, 143/2 (заїзд вул. Маккейна)');
  });

  it('працює, коли поле міста без префікса «м.»', () => {
    expect(stripCityPrefix('Чорноморськ, Миру пр-т, 39Н', 'Чорноморськ')).toBe('Миру пр-т, 39Н');
    expect(stripCityPrefix('м. Харків, Поштомат №57614', 'Харків')).toBe('Поштомат №57614');
  });

  it('не чіпає адресу, якщо міста на початку немає', () => {
    const addr = 'вул. Юності, 13Б (Біля магазину "МіхМаркет")';
    expect(stripCityPrefix(addr, 'Гнівань')).toBe(addr);
  });

  it('не плутає міста зі схожим початком', () => {
    expect(stripCityPrefix('Київська, 12', 'Київ')).toBe('Київська, 12');
  });

  it('лишає адресу, коли вона складається з самого міста', () => {
    expect(stripCityPrefix('м. Київ', 'Київ')).toBe('м. Київ');
  });

  it('порожні значення не ламають', () => {
    expect(stripCityPrefix(null, 'Київ')).toBe('');
    expect(stripCityPrefix('вул. Соборна, 1', null)).toBe('вул. Соборна, 1');
    expect(stripCityPrefix('', '')).toBe('');
  });
});
