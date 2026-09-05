import { describe, it, expect } from 'vitest';
import { saleDebitPartyFor, isSpecialDebtor, SALE_DEBTOR } from '../lib/accounting/sale-party';

const CUST = 'a59510d4-364a-4f32-8bbe-03c3fd057c34';

describe('saleDebitPartyFor — дебітор продажу за каналом грошей (Варіант B)', () => {
  it('наложка через НП → np:cod навіть якщо є картка клієнта', () => {
    expect(saleDebitPartyFor({ customer_id: CUST, channel_code: 'phone', payment_type: 'cod', delivery_type: 'nova' })).toBe('np:cod');
    expect(saleDebitPartyFor({ customer_id: CUST, channel_code: 'prom', payment_type: 'cod', delivery_type: 'nova_poshta' })).toBe('np:cod');
    expect(saleDebitPartyFor({ customer_id: null, channel_code: 'website', payment_type: 'cod', delivery_type: 'nova' })).toBe('np:cod');
  });

  it('наложка через Rozetka Доставка → mp:rozetka (збирає Rozetka, не НоваПей)', () => {
    expect(saleDebitPartyFor({ customer_id: CUST, channel_code: 'rozetka', payment_type: 'cod', delivery_type: 'rozetka_delivery' })).toBe('mp:rozetka');
    expect(saleDebitPartyFor({ customer_id: CUST, channel_code: 'retail', payment_type: 'cod', delivery_type: 'rz_delivery' })).toBe('mp:rozetka');
  });

  it('передоплата на площадці → mp:prom / mp:rozetka', () => {
    expect(saleDebitPartyFor({ customer_id: CUST, channel_code: 'prom', payment_type: 'prepaid', delivery_type: 'nova_poshta' })).toBe('mp:prom');
    expect(saleDebitPartyFor({ customer_id: CUST, channel_code: 'rozetka', payment_type: 'prepaid', delivery_type: 'nova_poshta' })).toBe('mp:rozetka');
  });

  it('безнал за рахунком для замовлення з Rozetka — платить нам напряму → клієнт', () => {
    expect(saleDebitPartyFor({ customer_id: CUST, channel_code: 'rozetka', payment_type: 'invoice', delivery_type: 'nova_poshta' })).toBe(CUST);
  });

  it('картка на сайті / готівка / відстрочка → клієнт, без картки → guest', () => {
    expect(saleDebitPartyFor({ customer_id: CUST, channel_code: 'website', payment_type: 'card' })).toBe(CUST);
    expect(saleDebitPartyFor({ customer_id: CUST, channel_code: 'retail', payment_type: 'cash' })).toBe(CUST);
    expect(saleDebitPartyFor({ customer_id: CUST, channel_code: 'wholesale', payment_type: 'deferred' })).toBe(CUST);
    expect(saleDebitPartyFor({ customer_id: null, channel_code: 'website', payment_type: 'card' })).toBe('guest');
  });

  it('дропшип-партнер лишається дебітором навіть при COD (його наложка — окремий механізм)', () => {
    expect(saleDebitPartyFor({ customer_id: CUST, channel_code: 'dropship', payment_type: 'cod', delivery_type: 'nova_poshta' })).toBe(CUST);
  });

  it('prepaid поза маркетплейсом не тягне на площадку', () => {
    expect(saleDebitPartyFor({ customer_id: CUST, channel_code: 'website', payment_type: 'prepaid' })).toBe(CUST);
  });
});

describe('isSpecialDebtor', () => {
  it('розпізнає службових дебіторів і не плутає з UUID', () => {
    expect(isSpecialDebtor(SALE_DEBTOR.npCod)).toBe(true);
    expect(isSpecialDebtor('mp:rozetka')).toBe(true);
    expect(isSpecialDebtor(CUST)).toBe(false);
    expect(isSpecialDebtor(null)).toBe(false);
  });
});
