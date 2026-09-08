import { describe, it, expect } from 'vitest';
import { rzPayEventFor, matchRzPayPayout, rzPayCandidatesFor, shiftDate, type RzPayEvent } from '../lib/rozetkapay-allocate-rules';

const base = { id: 'o1', order_number: 26091001, status: 'shipped', total_price: 500, delivered_at: null, customer_id: null };

describe('rzPayEventFor — коли RozetkaPay має заплатити за замовлення', () => {
  it('Prom-оплата: лише після вручення — дата = delivered_at за Києвом', () => {
    const paid = { status: 'paid', status_modified: '2026-09-02T20:17:43+00:00' };
    expect(rzPayEventFor({ ...base, channel_code: 'prom', payment_type: 'prepaid', delivery_type: 'nova_poshta', prom_payment: paid })).toBeNull();
    const e = rzPayEventFor({ ...base, channel_code: 'prom', payment_type: 'prepaid', delivery_type: 'nova_poshta', prom_payment: paid, delivered_at: '2026-09-05T22:30:00+00:00' });
    expect(e).toMatchObject({ party: 'mp:prom', at: '2026-09-06', kind: 'prom_delivered', amount: 500 });
  });
  it('Prom-оплата без статусу paid — не кандидат навіть після вручення', () => {
    expect(rzPayEventFor({ ...base, channel_code: 'prom', payment_type: 'prepaid', delivery_type: 'nova_poshta', prom_payment: { status: 'not_paid' }, delivered_at: '2026-09-05T10:00:00Z' })).toBeNull();
  });
  it('Rozetka передоплата: payment_status.created_at', () => {
    const e = rzPayEventFor({ ...base, channel_code: 'rozetka', payment_type: 'prepaid', delivery_type: 'rozetka_delivery', rz_payment: { payment_status: { name: 'paid', created_at: '2026-09-07 08:54:18' } } });
    expect(e).toMatchObject({ party: 'mp:rozetka', at: '2026-09-07', kind: 'rz_paid' });
  });
  it('наложка через Rozetka Delivery (і з сайту): після вручення; без вручення — ще не кандидат', () => {
    expect(rzPayEventFor({ ...base, channel_code: 'website', payment_type: 'cod', delivery_type: 'rz_delivery' })).toBeNull();
    const e = rzPayEventFor({ ...base, channel_code: 'rozetka', payment_type: 'cod', delivery_type: 'rozetka_delivery', delivered_at: '2026-09-06T10:00:00+00:00' });
    expect(e).toMatchObject({ party: 'mp:rozetka', at: '2026-09-06', kind: 'cod_delivered' });
  });
  it('не через RozetkaPay: наложка НП, картка на сайті, скасоване', () => {
    expect(rzPayEventFor({ ...base, channel_code: 'prom', payment_type: 'cod', delivery_type: 'nova_poshta', delivered_at: '2026-09-06T10:00:00Z' })).toBeNull();
    expect(rzPayEventFor({ ...base, channel_code: 'website', payment_type: 'card', delivery_type: 'nova_poshta' })).toBeNull();
    expect(rzPayEventFor({ ...base, status: 'cancelled', channel_code: 'prom', payment_type: 'prepaid', delivery_type: 'nova_poshta', prom_payment: { status: 'paid', status_modified: '2026-09-05T20:17:43Z' } })).toBeNull();
  });
});

describe('matchRzPayPayout — склад виплати підмножиною', () => {
  it('рівно на брутто, найменша підмножина', () => {
    const c = [{ id: 'a', amount: 2050 }, { id: 'b', amount: 1552 }, { id: 'c', amount: 1555 }, { id: 'd', amount: 1588 }, { id: 'e', amount: 410 }, { id: 'f', amount: 375 }];
    expect(matchRzPayPayout(5157, c)?.map(x => x.id)).toEqual(['a', 'b', 'c']);
  });
  it('копійки не губляться (97.20 + 108)', () => {
    const c = [{ id: 'a', amount: 97.2 }, { id: 'b', amount: 108 }, { id: 'c', amount: 205.3 }];
    expect(matchRzPayPayout(205.2, c)?.map(x => x.id)).toEqual(['a', 'b']);
    expect(matchRzPayPayout(205.3, c)?.map(x => x.id)).toEqual(['c']);
  });
  it('не підібрано → null', () => {
    expect(matchRzPayPayout(6150, [{ id: 'a', amount: 2050 }])).toBeNull();
    expect(matchRzPayPayout(100, [])).toBeNull();
  });
});

describe('rzPayCandidatesFor — вікно з лагом, без уже рознесених', () => {
  const ev = (orderId: string, at: string, amount = 100): RzPayEvent => ({ orderId, orderNumber: 1, party: 'mp:prom', at, kind: 'prom_delivered', amount });
  it('бере події від (from − LAG) до to включно, найстаріші першими', () => {
    const events = [ev('late', '2026-09-07'), ev('in', '2026-09-06'), ev('old', '2026-08-28'), ev('lag', '2026-08-29'), ev('done', '2026-09-05')];
    const c = rzPayCandidatesFor(events, '2026-09-04', '2026-09-06', new Set(['done']), 6);
    expect(c.map(e => e.orderId)).toEqual(['lag', 'in']);
  });
  it('shiftDate', () => { expect(shiftDate('2026-09-04', -6)).toBe('2026-08-29'); });
});

describe('rzPayEventFor — рахунок Rozetka (no_cash)', () => {
  it('відкритий борг покупця — кандидат з дати створення, дебітор = покупець', () => {
    const e = rzPayEventFor({ ...base, channel_code: 'rozetka', payment_type: 'invoice', delivery_type: 'nova_poshta', customer_id: 'cust-1', created_at: '2026-08-03T07:00:00Z', invoice_open: 2050 });
    expect(e).toMatchObject({ party: 'cust-1', at: '2026-08-03', kind: 'rz_invoice', amount: 2050 });
  });
  it('закритий рахунок (оплатили нам напряму) — не кандидат', () => {
    expect(rzPayEventFor({ ...base, channel_code: 'rozetka', payment_type: 'invoice', delivery_type: 'nova_poshta', created_at: '2026-08-03T07:00:00Z', invoice_open: 0 })).toBeNull();
  });
});
