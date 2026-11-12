import { describe, it, expect } from 'vitest';
import { isNpTracked, isManualPostalCarrier, looksLikeManualTtn, carrierFilterOf, NOT_NOVA_DELIVERY_TYPES, CARRIER_FILTERS } from '../lib/carriers';
import { rozetkaDeliveryTypeFor } from '../lib/rozetka-delivery';
import { promDeliveryTypeFor } from '../lib/prom-api';
import { isPromLedDelivery } from '../lib/prom-delivery-state';
import { planMergeTtn, type MergeTtnOrder } from '../lib/orders/merge-ttn';

describe('rozetkaDeliveryTypeFor — служба доставки Rozetka за id', () => {
  it('Meest (4) більше не стає Новою Поштою через слово «ПОШТА» (#26101130)', () => {
    expect(rozetkaDeliveryTypeFor({ delivery_service_id: 4, delivery_service_name: 'Meest ПОШТА' })).toBe('meest');
  });
  it('Укрпошта (2024)', () => {
    expect(rozetkaDeliveryTypeFor({ delivery_service_id: 2024, delivery_service_name: 'Укрпошта' })).toBe('ukrposhta');
  });
  it('Нова Пошта і поштомати НП', () => {
    expect(rozetkaDeliveryTypeFor({ delivery_service_id: 5, delivery_service_name: 'Нова Пошта' })).toBe('nova_poshta');
    expect(rozetkaDeliveryTypeFor({ delivery_service_id: 43660, delivery_service_name: 'Нова Пошта (поштомати)' })).toBe('nova_poshta');
  });
  it('точки видачі Rozetka — як і раніше', () => {
    expect(rozetkaDeliveryTypeFor({ delivery_service_id: 1, delivery_service_name: 'ROZETKA Delivery' })).toBe('rozetka_delivery');
    expect(rozetkaDeliveryTypeFor({ delivery_service_id: 56214, delivery_service_name: 'Rozetka Delivery (Партнерські відділення)' })).toBe('rozetka_delivery');
  });
  it('без id — за назвою; невідоме — courier', () => {
    expect(rozetkaDeliveryTypeFor({ delivery_service_name: 'Укрпошта' })).toBe('ukrposhta');
    expect(rozetkaDeliveryTypeFor({ delivery_service_name: 'Meest ПОШТА' })).toBe('meest');
    expect(rozetkaDeliveryTypeFor({ delivery_service_name: 'Нова Пошта' })).toBe('nova_poshta');
    expect(rozetkaDeliveryTypeFor({ delivery_service_id: 999, delivery_service_name: 'Щось нове' })).toBe('courier');
    expect(rozetkaDeliveryTypeFor(null)).toBe('courier');
  });
});

describe('promDeliveryTypeFor — спосіб доставки Prom', () => {
  it('живий provider meest_express → meest (#26091224, #26101231)', () => {
    expect(promDeliveryTypeFor('meest_express', { name: 'Meest ПОШТА' })).toBe('meest');
  });
  it('відомі провайдери', () => {
    expect(promDeliveryTypeFor('nova_poshta', { name: 'Нова Пошта' })).toBe('nova_poshta');
    expect(promDeliveryTypeFor('ukrposhta', null)).toBe('ukrposhta');
    expect(promDeliveryTypeFor('rozetka_delivery', { name: 'Магазины Rozetka' })).toBe('rz_delivery');
  });
  it('provider_data = null — за назвою, інакше НП', () => {
    expect(promDeliveryTypeFor(null, { name: 'Meest ПОШТА' })).toBe('meest');
    expect(promDeliveryTypeFor(null, { name: 'Укрпошта' })).toBe('ukrposhta');
    expect(promDeliveryTypeFor(null, { name: 'Самовивіз' })).toBe('nova_poshta');
  });
});

describe('isNpTracked — кого питати в НП', () => {
  it('НП, курʼєр і невідоме — так', () => {
    for (const t of ['nova', 'nova_poshta', 'courier', null]) expect(isNpTracked(t)).toBe(true);
  });
  it('Rozetka, Укрпошта, Meest — ні', () => {
    for (const t of ['rozetka_delivery', 'rz_delivery', 'ukrposhta', 'meest']) expect(isNpTracked(t)).toBe(false);
  });
  it('isManualPostalCarrier', () => {
    expect(isManualPostalCarrier('meest')).toBe(true);
    expect(isManualPostalCarrier('nova')).toBe(false);
  });
});

describe('isPromLedDelivery — Укрпошта/Meest зі своїм номером веде Prom', () => {
  it('Meest із номером', () => {
    expect(isPromLedDelivery({ delivery_type: 'meest', tracking_number: '7234228988' })).toBe(true);
    expect(isPromLedDelivery({ delivery_type: 'ukrposhta', tracking_number: '0500012345678' })).toBe(true);
  });
});

describe('looksLikeManualTtn', () => {
  it('Укрпошта: 13 цифр або міжнародний', () => {
    expect(looksLikeManualTtn('ukrposhta', '0500012345678')).toBe(true);
    expect(looksLikeManualTtn('ukrposhta', 'RR123456789UA')).toBe(true);
    expect(looksLikeManualTtn('ukrposhta', '05000123')).toBe(false);
  });
  it('Meest: цифри з дефісом чи префіксом, без кирилиці й пробілів', () => {
    expect(looksLikeManualTtn('meest', '723-4228988')).toBe(true);
    expect(looksLikeManualTtn('meest', 'CV123456789UA')).toBe(true);
    expect(looksLikeManualTtn('meest', '723 4228988')).toBe(false);
    expect(looksLikeManualTtn('meest', 'АБВ1234567')).toBe(false);
  });
});

describe('planMergeTtn — Укрпошта/Meest не об\'єднуються звідси', () => {
  const o = (id: string, delivery_type: string): MergeTtnOrder => ({
    id, order_number: Number(id), delivery_type, channel_code: 'prom', rozetka_order_id: null,
    tracking_number: null, phone: '0501112233', delivery_address: 'x', delivery_warehouse_ref: null,
  });
  it('пояснює, що робити', () => {
    const plan = planMergeTtn([o('1', 'meest'), o('2', 'meest')]);
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.error).toMatch(/кабінеті перевізника/);
  });
});

describe('carrierFilterOf — пункти фільтра «Доставка» в журналі', () => {
  it('Meest і Укрпошта — окремо, не «Нова Пошта» (до 12.11 рахувались як НП)', () => {
    expect(carrierFilterOf('meest')).toBe('meest');
    expect(carrierFilterOf('ukrposhta')).toBe('ukrposhta');
    expect(carrierFilterOf('nova')).toBe('nova');
    expect(carrierFilterOf('nova_poshta')).toBe('nova');
    expect(carrierFilterOf('rozetka_delivery')).toBe('rozetka');
    expect(carrierFilterOf('rz_delivery')).toBe('rozetka');
    expect(carrierFilterOf('pickup')).toBeNull();
  });
  it('запит «nova» виключає всіх, кого carrierFilterOf відносить не до НП', () => {
    for (const t of NOT_NOVA_DELIVERY_TYPES) expect(carrierFilterOf(t)).not.toBe('nova');
    expect(CARRIER_FILTERS.map(c => c.value)).toEqual(['nova', 'rozetka', 'meest', 'ukrposhta']);
  });
});
