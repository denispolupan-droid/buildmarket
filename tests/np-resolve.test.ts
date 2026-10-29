import { describe, it, expect } from 'vitest';
import { warehouseNumberFromAddress, pickWarehouseByAddress, formNovaSubtype } from '../lib/np-resolve';

const W = (n: string, desc: string) => ({ Ref: `ref-${n}`, Number: n, Description: desc });

describe('warehouseNumberFromAddress', () => {
  it('витягує номер після «№», з пробілом і без', () => {
    expect(warehouseNumberFromAddress('Відділення №4, вул. Євгена Чикаленка, 86')).toBe('4');
    expect(warehouseNumberFromAddress('Поштомат № 8771: вул. Х, 1')).toBe('8771');
  });
  it('без «№» — null', () => {
    expect(warehouseNumberFromAddress('Пункт приймання-видачі (до 30 кг): вул. Шкільна, 1-А')).toBeNull();
    expect(warehouseNumberFromAddress(null)).toBeNull();
  });
});

describe('pickWarehouseByAddress', () => {
  const list = [
    W('1', 'Відділення №1: вул. Перша, 1'),
    W('4', 'Відділення №4 (до 30 кг): вул. Євгена Чикаленка, 86'),
    W('8771', 'Поштомат №8771: вул. Друга, 2'),
  ];

  it('з номером у тексті — лише точний збіг за номером', () => {
    expect(pickWarehouseByAddress(list, 'Відділення №4, вул. Євгена Чикаленка, 86', false)?.Ref).toBe('ref-4');
    expect(pickWarehouseByAddress(list, 'Відділення №77', false)).toBeNull();
  });

  it('без номера: єдиний пункт потрібного типу — він', () => {
    const village = [W('1', 'Пункт приймання-видачі (до 30 кг): вул. Шкільна, 1-А'), W('9', 'Поштомат №9: вул. Х')];
    expect(pickWarehouseByAddress(village, 'Пункт приймання-видачі (до 30 кг): вул. Шкільна, 1-А', false)?.Ref).toBe('ref-1');
    expect(pickWarehouseByAddress(village, 'що завгодно', true)?.Ref).toBe('ref-9');
  });

  it('без номера й кілька пунктів — за дослівним описом у тексті, інакше null', () => {
    const two = [W('1', 'Пункт приймання-видачі: вул. Шкільна, 1-А'), W('2', 'Пункт приймання-видачі: вул. Садова, 2')];
    expect(pickWarehouseByAddress(two, 'Село, Пункт приймання-видачі:  вул. Садова, 2', false)?.Ref).toBe('ref-2');
    expect(pickWarehouseByAddress(two, 'Село', false)).toBeNull();
    expect(pickWarehouseByAddress(two, '', false)).toBeNull();
  });
});

describe('formNovaSubtype', () => {
  it("адресні варіанти з БД → кур'єр", () => {
    expect(formNovaSubtype('address', null)).toBe('courier');
    expect(formNovaSubtype('doors', null)).toBe('courier');
    expect(formNovaSubtype('courier', null)).toBe('courier');
  });
  it('поштомат — явний або за текстом адреси (Prom)', () => {
    expect(formNovaSubtype('postomat', null)).toBe('postomat');
    expect(formNovaSubtype('warehouse', 'Поштомат №8771: вул. Х')).toBe('postomat');
    expect(formNovaSubtype(null, 'Поштомат №8771')).toBe('postomat');
  });
  it('решта — відділення; слово «поштомат» в адресі кур’єра не змінює тип', () => {
    expect(formNovaSubtype('warehouse', 'Відділення №4')).toBe('warehouse');
    expect(formNovaSubtype(null, null)).toBe('warehouse');
    expect(formNovaSubtype('address', 'біля поштомату')).toBe('courier');
  });
});
