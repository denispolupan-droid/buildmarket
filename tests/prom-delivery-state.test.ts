import { describe, it, expect } from 'vitest';
import { promDeliveryPatch, promDeliveryStatusText, isPromLedDelivery } from '../lib/prom-delivery-state';

const NOW = '2026-09-29T10:00:00.000Z';
const shipped = { status: 'shipped', tracking_number: 'PRM-587422383', carrier_accepted_at: null, carrier_status_text: null };

describe('promDeliveryPatch — рух посилки за даними Prom', () => {
  // Живий кейс 26091243: «Магазини Rozetka», у Prom unified_status=on_the_way,
  // у нас — «До відправки» без carrier_accepted_at до самого вручення.
  it('on_the_way ставить «прийнято перевізником» і текст', () => {
    const r = promDeliveryPatch(shipped, { unified_status: 'on_the_way', declaration_number: 'PRM-587422383' }, NOW);
    expect(r.accepted).toBe(true);
    expect(r.delivered).toBe(false);
    expect(r.patch).toEqual({
      carrier_status_text: 'В дорозі (за даними Prom)',
      carrier_status_synced_at: NOW,
      carrier_accepted_at: NOW,
    });
  });

  it('in_warehouse — так само прийнято, текст «У відділенні»', () => {
    const r = promDeliveryPatch(shipped, { unified_status: 'in_warehouse' }, NOW);
    expect(r.accepted).toBe(true);
    expect(r.patch.carrier_status_text).toBe('У відділенні (за даними Prom)');
  });

  it('delivered — прийнято + прапорець вручення для проводок', () => {
    const r = promDeliveryPatch(shipped, { unified_status: 'delivered' }, NOW);
    expect(r).toMatchObject({ accepted: true, delivered: true });
    expect(r.patch.carrier_status_text).toBe('Вручено (за даними Prom)');
  });

  it('уже прийняте з тим самим текстом — нічого не пише (крон ходить кожні 5 хв)', () => {
    const r = promDeliveryPatch(
      { ...shipped, carrier_accepted_at: '2026-09-28T10:00:00Z', carrier_status_text: 'В дорозі (за даними Prom)' },
      { unified_status: 'on_the_way' }, NOW,
    );
    expect(r.accepted).toBe(false);
    expect(r.patch).toEqual({});
  });

  it('без unified_status або не відвантажене — нічого', () => {
    expect(promDeliveryPatch(shipped, { unified_status: null }, NOW).patch).toEqual({});
    expect(promDeliveryPatch(shipped, null, NOW).patch).toEqual({});
    expect(promDeliveryPatch({ ...shipped, status: 'confirmed' }, { unified_status: 'on_the_way' }, NOW).patch).toEqual({});
    expect(promDeliveryPatch({ ...shipped, status: 'delivered' }, { unified_status: 'delivered' }, NOW).patch).toEqual({});
  });

  it('невідомий стан Prom — текст як є, без «прийнято»', () => {
    const r = promDeliveryPatch(shipped, { unified_status: 'created' }, NOW);
    expect(r.accepted).toBe(false);
    expect(r.patch.carrier_status_text).toBe('created (за даними Prom)');
  });
});

describe('promDeliveryStatusText', () => {
  // Живий кейс 26091224: Meest, ТТН створено в кабінеті Prom, у нас tracking_number null
  it('без свого номера показує декларацію Prom', () => {
    expect(promDeliveryStatusText({ unified_status: 'on_the_way', declaration_number: '723-4228988' }, null))
      .toBe('В дорозі (за даними Prom) · 723-4228988');
  });
  it('зі своїм номером декларацію не дублює', () => {
    expect(promDeliveryStatusText({ unified_status: 'on_the_way', declaration_number: 'PRM-1' }, 'PRM-1'))
      .toBe('В дорозі (за даними Prom)');
  });
});

describe('isPromLedDelivery — чий рух наші крони не бачать', () => {
  it('«Магазини Rozetka» (PRM-…) і будь-що без нашого номера — веде Prom', () => {
    expect(isPromLedDelivery({ delivery_type: 'rz_delivery', tracking_number: 'PRM-587422383' })).toBe(true);
    expect(isPromLedDelivery({ delivery_type: 'nova_poshta', tracking_number: null })).toBe(true);
  });
  it('НП зі своєю ЕН — трекає крон НП', () => {
    expect(isPromLedDelivery({ delivery_type: 'nova_poshta', tracking_number: '20451547836745' })).toBe(false);
  });
});
