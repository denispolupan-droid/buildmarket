import { describe, it, expect } from 'vitest';
import { isPostomatText, resolveDeliverySubtype } from '../lib/np-postomat';

// Рядки адрес — реальні з бази: Rozetka пише тип структурно, Prom — ні, і
// поштомат у нього приїжджає як звичайний «warehouse».
describe('isPostomatText', () => {
  it('впізнає поштомат у різних написаннях', () => {
    expect(isPostomatText('м. Київ, Поштомат №8771: вул. Прирічна, 5')).toBe(true);
    expect(isPostomatText('Поштомат "Нова Пошта" №43629: вул. Прибережна, 143')).toBe(true);
    expect(isPostomatText('Почтомат №123')).toBe(true);
  });

  it('відділення поштоматом не вважає', () => {
    expect(isPostomatText('Київ, Відділення №455, просп. Лобановського, 126А')).toBe(false);
    expect(isPostomatText(null)).toBe(false);
    expect(isPostomatText('')).toBe(false);
  });
});

describe('resolveDeliverySubtype', () => {
  it('Prom: «склад» з поштоматом у адресі стає поштоматом', () => {
    // Замовлення 26081049 — саме через це накладну виписали на відділення.
    expect(resolveDeliverySubtype('warehouse', 'м. Київ, Поштомат №8771: вул. Прирічна, 5')).toBe('postomat');
    expect(resolveDeliverySubtype(null, 'Харків, Поштомат №55391: вул. Лодзька, 7-А')).toBe('postomat');
  });

  it('справжнє відділення лишається відділенням', () => {
    expect(resolveDeliverySubtype('warehouse', 'Київ, Відділення №455')).toBe('warehouse');
  });

  it('явний тип від маркетплейсу поважаємо', () => {
    expect(resolveDeliverySubtype('postomat', 'Київ, Поштомат №22935')).toBe('postomat');
  });

  it('адресну доставку не переписуємо', () => {
    // Там «поштомат» у рядку — це орієнтир («біля поштомату»), а не спосіб видачі.
    expect(resolveDeliverySubtype('address', 'вул. Лесі Українки, 5 (біля поштомату)')).toBe('address');
    expect(resolveDeliverySubtype('courier', 'вул. Лесі Українки, 5')).toBe('courier');
  });
});
