import { describe, it, expect } from 'vitest';
import {
  buildEpicentrShipmentBody, epicentrMeestProvider, epicentrPhone, matchMeestOffice, meestSeatProblem, splitSenderName,
} from '../lib/epicentr-meest';
import { ttnFollowUpAction } from '../lib/orders/ttn-followup';

describe('відділення Meest за адресою точки Rozetka', () => {
  // Живі дані 12.11.2026: точка Rozetka «Харків, вул. Богдана Хмельницького 32 А»,
  // у довіднику Meest — «№ 12, вул. Хмельницького Богдана, 32А»
  const offices = [
    { id: 'a', settlementId: 's', title: '№ 3, вул. Сумська, 32', address: 'вул. Сумська, 32' },
    { id: 'b', settlementId: 's', title: '№ 12, вул. Хмельницького Богдана, 32А', address: 'вул. Хмельницького Богдана, 32А' },
    { id: 'c', settlementId: 's', title: '№ 40, вул. Хмельницького Богдана, 3', address: 'вул. Хмельницького Богдана, 3' },
  ];
  it('збіг вулиці (інший порядок слів) і будинку з літерою через пробіл', () => {
    expect(matchMeestOffice(offices, 'Харків, вул. Богдана Хмельницького 32 А')?.id).toBe('b');
  });
  it('без точного будинку — нічого, а не «схоже» відділення', () => {
    expect(matchMeestOffice(offices, 'Харків, вул. Богдана Хмельницького 7')).toBeNull();
  });
});

describe('посилка в поштомат / пункт видачі', () => {
  const seat = { weightKg: 1, lengthCm: 30, widthCm: 20, heightCm: 10 };
  const cell = { width: 440, height: 650, length: 670, weight: 30000 };   // мм і г з картки /v6
  it('звичайна коробка проходить', () => {
    expect(meestSeatProblem(seat, 'parcel_box_epicentr', cell)).toBeNull();
    expect(meestSeatProblem(seat, 'cvz_epicentr')).toBeNull();
  });
  it('поштомат: до 29 кг і розмір комірки (сторони порівнюємо відсортованими)', () => {
    expect(meestSeatProblem({ ...seat, weightKg: 29.5 }, 'parcel_box_epicentr', cell)).toMatch(/29 кг/);
    expect(meestSeatProblem({ ...seat, lengthCm: 66, widthCm: 64, heightCm: 44 }, 'parcel_box_epicentr', cell)).toBeNull();
    expect(meestSeatProblem({ ...seat, lengthCm: 70, widthCm: 50, heightCm: 50 }, 'parcel_box_epicentr', cell)).toMatch(/комірку/);
  });
  it('пункт видачі: 30 кг, 70 см сторона, 0,118 м³', () => {
    expect(meestSeatProblem({ ...seat, weightKg: 31 }, 'cvz_epicentr')).toMatch(/30 кг/);
    expect(meestSeatProblem({ ...seat, lengthCm: 71 }, 'cvz_epicentr')).toMatch(/70 см/);
    expect(meestSeatProblem({ ...seat, lengthCm: 60, widthCm: 50, heightCm: 50 }, 'cvz_epicentr')).toMatch(/0,118/);
  });
  it('без габаритів — помилка', () => {
    expect(meestSeatProblem({ ...seat, heightCm: NaN }, 'cvz_epicentr')).toMatch(/габарит/);
  });
});

describe('тіло накладної Meest-Епіцентр', () => {
  it('відправник — відділення Meest, платимо ми, без післяплати, см/кг як у формі кабінету', () => {
    const body = buildEpicentrShipmentBody({
      sender: { ...splitSenderName('Полупан Денис Олександрович'), phone: epicentrPhone('+38 (050) 111-22-33'), settlementId: 'S', officeId: 'O' },
      seat: { weightKg: 0.85, lengthCm: 25, widthCm: 15, heightCm: 10 },
      declared: 403,
      description: 'Клей Pattex Столяр 750 г',
    });
    expect(body).toEqual({
      sender: { name: 'Денис', lastName: 'Полупан', middleName: 'Олександрович', settlementId: 'S', officeId: 'O', phone: '380501112233', provider: 'meest' },
      items: [{ width: 15, height: 10, length: 25, weight: 0.85, insuredValue: 403 }],
      deliveryPayer: 'merchant',
      isPostPayment: false,
      description: 'Клей Pattex Столяр 750 г',
    });
  });
  it('провайдер — лише поштомати й пункти видачі Епіцентру', () => {
    expect(epicentrMeestProvider({ address: { shipment: { provider: 'parcel_box_epicentr' } } })).toBe('parcel_box_epicentr');
    expect(epicentrMeestProvider({ address: { shipment: { provider: 'cvz_epicentr' } } })).toBe('cvz_epicentr');
    expect(epicentrMeestProvider({ address: { shipment: { provider: 'meest' } } })).toBeNull();
    expect(epicentrMeestProvider(null)).toBeNull();
  });
});

describe('хвіст після накладної, виписаної Епіцентром', () => {
  const o = { status: 'confirmed', fulfillment_mode: null, channel_code: 'epicentr', delivery_type: 'meest' };
  it('номер Епіцентр знає сам — не пушимо', () => {
    expect(ttnFollowUpAction(o, 'marketplace')).toBe('none');
    expect(ttnFollowUpAction(o, 'api')).toBe('push-epicentr');
  });
  it('дропшип усе одно відвантажується', () => {
    expect(ttnFollowUpAction({ ...o, fulfillment_mode: 'supplier' }, 'marketplace')).toBe('ship');
  });
});
