import { describe, it, expect } from 'vitest';
import { reorderList } from '../lib/reorder';

const L = ['a', 'b', 'c', 'd'];

describe('reorderList', () => {
  it('переносить елемент донизу', () => {
    expect(reorderList(L, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('переносить елемент догори', () => {
    expect(reorderList(L, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('сусідній обмін працює в обидва боки', () => {
    expect(reorderList(L, 1, 2)).toEqual(['a', 'c', 'b', 'd']);
    expect(reorderList(L, 2, 1)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('те саме місце — список без змін (і той самий масив)', () => {
    expect(reorderList(L, 2, 2)).toBe(L);
  });

  it('індекси поза межами не ламають список', () => {
    expect(reorderList(L, -1, 2)).toBe(L);
    expect(reorderList(L, 0, 9)).toBe(L);
  });

  it('не мутує вихідний масив', () => {
    const copy = [...L];
    reorderList(L, 0, 3);
    expect(L).toEqual(copy);
  });
});
