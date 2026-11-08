import { describe, it, expect } from 'vitest';
import { ttnPushEvents } from '../lib/outbox/enqueue';

describe('outbox mp.push_ttn: ключ дедуплікації', () => {
  const base = {
    order_number: 1, tracking_number: null, delivery_type: 'nova_poshta', prom_order_id: 7,
    rozetka_order_id: null, epicentr_order_id: null, rozetka_cabinet_status: null,
  } as unknown as Parameters<typeof ttnPushEvents>[1];
  it('та сама ЕН у ту саму хвилину — один ключ (подвійний клік); ключ містить хвилинну мітку', () => {
    const a = ttnPushEvents('o1', base, '2045', 'shipped', true)[0].dedupe_key;
    const b = ttnPushEvents('o1', base, '2045', 'shipped', true)[0].dedupe_key;
    expect(a).toBe(b);
    expect(a).toMatch(/:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});
