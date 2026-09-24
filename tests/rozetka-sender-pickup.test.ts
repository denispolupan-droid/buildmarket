import { describe, it, expect } from 'vitest';
import { normalizeSenderPickup } from '../lib/rozetka-delivery';

// Живі рядки GET /delivery-rozetka/find-sender-pickups?city_id=e1d394d7… (Харків, 24.09.2026)
const KH = { id: 'e1d394d7-1f52-4f6f-b0ba-f7f5afb1628c', name: 'Харків' };

const BKHMELNYTSKOHO = {
  id: null,
  pickup_id: '84a03f07-79e7-4161-99ee-1db7ff89dfed',
  name_uk: 'Харків, вул.вул. Б.Хмельницького, 32 А',
  name_ru: 'Харьков, ул. Богдана Хмельницкого 32 А',
  max_weight: null,
  max_volume_weight: 40,
  max_physical_weight: 30,
  street: {
    id: '9806c57a-7258-47a4-89a1-7ed8f5a564c5',
    name_uk: 'Богдана Хмельницького',
    city: { id: KH.id, name_uk: 'Харків' },
    type: { short_name_uk: 'вул.' },
  },
  house_number: '32 А',
  pickupTypeMapped: 0,
};

const STADIONNYI = {
  id: null,
  pickup_id: '025a7ac3-6688-4e36-b5b8-48ea791aaa49',
  name_uk: 'Стадіонний пр., 5А',
  max_weight: null,
  max_physical_weight: 100,
  street: { name_uk: 'Стадіонний', city: { id: KH.id, name_uk: 'Харків' }, type: { short_name_uk: 'пр-д' } },
  house_number: '5А',
  pickupTypeMapped: 0,
};

describe('normalizeSenderPickup', () => {
  it('збирає назву з вулиці й будинку, а адресу — з містом (так само, як в історії накладних)', () => {
    const p = normalizeSenderPickup(BKHMELNYTSKOHO, KH);
    expect(p.id).toBe('84a03f07-79e7-4161-99ee-1db7ff89dfed');
    expect(p.label).toBe('вул. Богдана Хмельницького, 32 А');
    expect(p.address).toBe('Харків, вул. Богдана Хмельницького, 32 А');
    expect(p.cityId).toBe(KH.id);
    expect(p.cityName).toBe('Харків');
    expect(p.typeMapped).toBe(0);
  });

  it('ліміт — фактична вага, об’ємну не плутає з нею', () => {
    expect(normalizeSenderPickup(BKHMELNYTSKOHO, KH).limitKg).toBe(30);
    expect(normalizeSenderPickup(STADIONNYI, KH).limitKg).toBe(100);
    expect(normalizeSenderPickup({ ...STADIONNYI, max_physical_weight: null }, KH).limitKg).toBeNull();
    expect(normalizeSenderPickup({ ...STADIONNYI, max_weight: '30.000' }, KH).limitKg).toBe(30);
  });

  it('без вулиці — бере name_uk, зрізає місто й подвоєне «вул.вул.»', () => {
    const p = normalizeSenderPickup({ ...BKHMELNYTSKOHO, street: null }, KH);
    expect(p.label).toBe('вул. Б.Хмельницького, 32 А');
    expect(p.address).toBe('Харків, вул. Б.Хмельницького, 32 А');
    expect(normalizeSenderPickup({ ...STADIONNYI, street: null }, KH).label).toBe('Стадіонний пр., 5А');
  });
});
