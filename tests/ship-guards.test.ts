import { describe, it, expect } from 'vitest';
import { pickupWithTtnError, manualStatusWithoutSaleError } from '../lib/orders/ship-guards';

describe('manualStatusWithoutSaleError — «Відправлено»/«Доставлено» руками без РН (#26091195)', () => {
  const withItems = { items: [{ sku: '1205-021', qty: 1, price: 1050 }] };

  it('shipped без видаткової — блок, із підказкою відвантажити кнопкою', () => {
    const msg = manualStatusWithoutSaleError('shipped', withItems, 0);
    expect(msg).toContain('Відправлено');
    expect(msg).toContain('Відвантажити');
  });

  it('delivered без видаткової — блок', () => {
    expect(manualStatusWithoutSaleError('delivered', withItems, 0)).toContain('Доставлено');
  });

  it('РН уже є (чернетка чи проведена) — можна', () => {
    expect(manualStatusWithoutSaleError('shipped', withItems, 1)).toBeNull();
    expect(manualStatusWithoutSaleError('delivered', withItems, 2)).toBeNull();
  });

  it('замовлення без позицій інваріант не рахує — не чіпаємо', () => {
    expect(manualStatusWithoutSaleError('shipped', { items: [] }, 0)).toBeNull();
    expect(manualStatusWithoutSaleError('shipped', { items: null }, 0)).toBeNull();
    expect(manualStatusWithoutSaleError('shipped', {}, 0)).toBeNull();
  });

  it('інші статуси — не чіпаємо', () => {
    for (const s of ['new', 'confirmed', 'picking', 'awaiting_stock', 'cancelled']) {
      expect(manualStatusWithoutSaleError(s, withItems, 0)).toBeNull();
    }
  });
});

describe('pickupWithTtnError — самовивіз із накладною перевізника', () => {
  it('самовивіз без накладної — можна', () => {
    expect(pickupWithTtnError({ delivery_type: 'pickup', tracking_number: null, tracking_ref: null })).toBeNull();
    expect(pickupWithTtnError({ delivery_type: 'pickup', tracking_number: '  ', tracking_ref: '' }, '')).toBeNull();
  });

  it('самовивіз із ЕН у замовленні — блок з номером у тексті', () => {
    const msg = pickupWithTtnError({ delivery_type: 'pickup', tracking_number: '20451525048109', tracking_ref: null });
    expect(msg).toContain('Самовивіз');
    expect(msg).toContain('№20451525048109');
    expect(msg).toContain('змініть тип доставки');
  });

  it('самовивіз, ЕН передана лише в тілі запиту — блок', () => {
    expect(pickupWithTtnError({ delivery_type: 'pickup', tracking_number: null }, '20451525048109')).toContain('№20451525048109');
  });

  it('самовивіз лише з tracking_ref (номер ще не записаний) — блок без номера', () => {
    const msg = pickupWithTtnError({ delivery_type: 'pickup', tracking_number: null, tracking_ref: '01a05bab-7782' });
    expect(msg).not.toBeNull();
    expect(msg).not.toContain('№');
  });

  it('Нова Пошта / RZ / інші типи з накладною — не чіпаємо', () => {
    expect(pickupWithTtnError({ delivery_type: 'nova_poshta', tracking_number: '20451525048109' })).toBeNull();
    expect(pickupWithTtnError({ delivery_type: 'rz_delivery', tracking_number: '123' })).toBeNull();
    expect(pickupWithTtnError({ delivery_type: null, tracking_number: '123' })).toBeNull();
  });
});
