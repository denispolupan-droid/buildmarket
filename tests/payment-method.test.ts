import { describe, it, expect } from 'vitest';
import { marketplacePaymentMethod } from '../lib/payment-method';

describe('marketplacePaymentMethod — Prom', () => {
  it('бере назву способу оплати з кабінету', () => {
    expect(marketplacePaymentMethod({
      channel_code: 'prom',
      prom_data: {
        payment_option: { id: 11531396, name: 'Пром-оплата' },
        payment_data: { type: 'evopay', status: 'paid', status_modified: '2026-08-07T06:39:29.006618+00:00' },
      },
    })).toEqual({ label: 'Пром-оплата', paidAt: '2026-08-07T06:39:29.006618+00:00' });
  });

  it('додає уточнення, коли спосіб проведення інший за назву', () => {
    expect(marketplacePaymentMethod({
      channel_code: 'prom',
      prom_data: {
        payment_option: { name: 'Оплата карткою' },
        payment_data: { type: 'apple_pay', status: 'paid', status_modified: '2026-08-07T06:39:29Z' },
      },
    })).toEqual({ label: 'Оплата карткою', detail: 'Apple Pay', paidAt: '2026-08-07T06:39:29Z' });
  });

  it('незнайомий код показує як є, а не ковтає', () => {
    expect(marketplacePaymentMethod({
      channel_code: 'prom',
      prom_data: { payment_data: { type: 'monopay', status: 'pending' } },
    })).toEqual({ label: 'monopay' });
  });

  it('неоплачене не позначає часом оплати', () => {
    expect(marketplacePaymentMethod({
      channel_code: 'prom',
      prom_data: { payment_option: { name: 'Пром-оплата' }, payment_data: { type: 'evopay', status: 'pending' } },
    })).toEqual({ label: 'Пром-оплата' });
  });
});

describe('marketplacePaymentMethod — Rozetka', () => {
  it('назва способу + тип оплати', () => {
    expect(marketplacePaymentMethod({
      channel_code: 'rozetka',
      rozetka_data: {
        payment: {
          payment_method_name: 'Оплата під час отримання товару',
          payment_type_title: 'Готівкова',
          payment_type: 'cash',
        },
      },
    })).toEqual({ label: 'Оплата під час отримання товару', detail: 'Готівкова' });
  });

  it('не дублює, коли назва і тип збігаються', () => {
    expect(marketplacePaymentMethod({
      channel_code: 'rozetka',
      rozetka_data: { payment: { payment_method_name: 'Картка', payment_type_title: 'картка' } },
    })).toEqual({ label: 'Картка' });
  });
});

describe('marketplacePaymentMethod — решта', () => {
  it('для власних каналів нічого не вигадує', () => {
    expect(marketplacePaymentMethod({ channel_code: 'website' })).toBeNull();
    expect(marketplacePaymentMethod({ channel_code: 'prom', prom_data: null })).toBeNull();
    expect(marketplacePaymentMethod({ channel_code: 'rozetka', rozetka_data: {} })).toBeNull();
  });
});
