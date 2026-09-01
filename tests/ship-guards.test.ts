import { describe, it, expect } from 'vitest';
import { pickupWithTtnError } from '../lib/orders/ship-guards';

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
