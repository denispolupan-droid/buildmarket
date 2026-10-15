import { describe, it, expect } from 'vitest';
import { pickupWithTtnError, manualStatusWithoutSaleError, ttnReuseError } from '../lib/orders/ship-guards';

describe('ttnReuseError — ЕН уже в іншому замовленні (#26101011 → #26101063, 15.10.2026)', () => {
  const other = { order_number: 26101011, status: 'cancelled' };

  it('чужа ЕН без підтвердження — блок із номером замовлення і підказкою про переадресацію', () => {
    const msg = ttnReuseError('20451552188672', other, false);
    expect(msg).toContain('№20451552188672');
    expect(msg).toContain('#26101011');
    expect(msg).toContain('скасоване');
    expect(msg).toContain('переадресація');
  });

  it('підтверджена переадресація — можна', () => {
    expect(ttnReuseError('20451552188672', other, true)).toBeNull();
  });

  it('ЕН ні в кого / порожня — можна', () => {
    expect(ttnReuseError('20451552188672', null, false)).toBeNull();
    expect(ttnReuseError('  ', other, false)).toBeNull();
    expect(ttnReuseError(undefined, other, false)).toBeNull();
  });

  it('невідомий статус показується як є', () => {
    expect(ttnReuseError('1', { order_number: 1, status: 'weird' }, false)).toContain('(weird)');
  });
});

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
