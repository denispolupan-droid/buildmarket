import { describe, it, expect } from 'vitest';
import { isRozetkaDelivery, rozetkaPickupAddress, ROZETKA_DELIVERY_TYPE } from '../lib/rozetka-delivery';

// Живий payload замовлення 902034824 (02.08.2026) — перша доставка в точку видачі
const OCTOPUS = {
  delivery_service_id: 1,
  delivery_service_name: 'ROZETKA Delivery',
  name_logo: 'octopus',
  place_street: 'проспект Повітряних сил України',
  place_number: " (ЖК Ok'Land)",
  place_house: '56',
  place_flat: null,
};

const NOVA = {
  delivery_service_id: 5,
  delivery_service_name: 'Нова Пошта',
  name_logo: 'nova-pochta',
  place_street: null,
  place_number: '1',
  place_house: null,
  place_flat: null,
};

describe('isRozetkaDelivery', () => {
  it('впізнає доставку в точки видачі Rozetka', () => {
    expect(isRozetkaDelivery(OCTOPUS)).toBe(true);
  });

  it('Нову Пошту не чіпає', () => {
    expect(isRozetkaDelivery(NOVA)).toBe(false);
  });

  it('порожня доставка не падає', () => {
    expect(isRozetkaDelivery(null)).toBe(false);
    expect(isRozetkaDelivery(undefined)).toBe(false);
    expect(isRozetkaDelivery({})).toBe(false);
  });

  it('ознака — числовий id служби, а не назва: назву Rozetka може переписати', () => {
    expect(isRozetkaDelivery({ delivery_service_id: 1 })).toBe(true);
    // та сама назва, але інша служба — не наш випадок
    expect(isRozetkaDelivery({ delivery_service_id: 4 })).toBe(false);
  });
});

describe('rozetkaPickupAddress', () => {
  it("не клеїть «Відділення №» до орієнтира", () => {
    const addr = rozetkaPickupAddress(OCTOPUS, 'Київ');
    expect(addr).not.toContain('Відділення');
    expect(addr).toBe("Київ, проспект Повітряних сил України, 56, (ЖК Ok'Land)");
  });

  it('порожні шматки не лишають подвійних ком', () => {
    expect(rozetkaPickupAddress({ place_street: 'вул. Тестова', place_house: null, place_number: null }, 'Львів'))
      .toBe('Львів, вул. Тестова');
    expect(rozetkaPickupAddress(null, 'Київ')).toBe('Київ');
    expect(rozetkaPickupAddress(null, '')).toBe('');
  });
});

describe('ROZETKA_DELIVERY_TYPE', () => {
  it("окремий тип, а не 'courier' — на courier зав'язана логіка НП", () => {
    expect(ROZETKA_DELIVERY_TYPE).toBe('rozetka_delivery');
    expect(ROZETKA_DELIVERY_TYPE).not.toBe('courier');
    expect(ROZETKA_DELIVERY_TYPE).not.toBe('nova_poshta');
  });
});
