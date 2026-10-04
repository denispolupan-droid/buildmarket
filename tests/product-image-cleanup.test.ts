import { describe, it, expect } from 'vitest';
import { oldImageKeyToDelete } from '../lib/product-image-cleanup';

const OLD = '/img/products/pattex/1000-007-fa4bf37ac7.webp';
const NEW = '/img/products/pattex/1000-007-0123456789.webp';

describe('oldImageKeyToDelete', () => {
  it('видаляє старий хешований файл, коли шлях змінився і більше ніхто не посилається', () => {
    expect(oldImageKeyToDelete(OLD, NEW, 0)).toBe('pattex/1000-007-fa4bf37ac7.webp');
  });
  it('не чіпає файл, якщо на нього посилається інший товар', () => {
    expect(oldImageKeyToDelete(OLD, NEW, 1)).toBeNull();
  });
  it('не чіпає, якщо шлях не змінився', () => {
    expect(oldImageKeyToDelete(OLD, OLD, 0)).toBeNull();
  });
  it('не чіпає файли без хешу (оригінали міграції) і чужі адреси', () => {
    expect(oldImageKeyToDelete('/img/products/pattex/1000-007.webp', NEW, 0)).toBeNull();
    expect(oldImageKeyToDelete('https://cdn.example.com/a.webp', NEW, 0)).toBeNull();
    expect(oldImageKeyToDelete(null, NEW, 0)).toBeNull();
  });
  it('зняте фото (null) теж звільняє старий файл', () => {
    expect(oldImageKeyToDelete(OLD, null, 0)).toBe('pattex/1000-007-fa4bf37ac7.webp');
  });
});
