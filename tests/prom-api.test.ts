import { describe, it, expect } from 'vitest';
import { promDateParam, parsePromNumber, promOrderToOurFormat } from '../lib/prom-api';
import type { PromOrder } from '../lib/prom-api';

describe('promDateParam — нормалізація date_from для Prom /orders/list', () => {
  it('прибирає мілісекунди і Z (Date.toISOString) — інакше Prom повертає 0 замовлень', () => {
    expect(promDateParam('2026-07-20T18:10:44.174Z')).toBe('2026-07-20T18:10:44');
    expect(promDateParam('2026-07-20T18:10:44.000Z')).toBe('2026-07-20T18:10:44');
  });

  it('ISO без мілісекунд лишає як є', () => {
    expect(promDateParam('2026-07-20T18:10:44')).toBe('2026-07-20T18:10:44');
  });

  it('date-only лишає як є', () => {
    expect(promDateParam('2026-07-20')).toBe('2026-07-20');
  });
});

describe('parsePromNumber — грошові поля Prom ("1 713 грн")', () => {
  it('пробіл-розділювач тисяч + суфікс валюти (інакше parseFloat дає 1)', () => {
    expect(parsePromNumber('1 713 грн')).toBe(1713);
  });

  it('nbsp як розділювач тисяч', () => {
    const nbsp = String.fromCharCode(0x00A0);
    expect(parsePromNumber(`1${nbsp}713${nbsp}грн`)).toBe(1713);
  });

  it('кома як десятковий', () => {
    expect(parsePromNumber('1 713,50 грн')).toBe(1713.5);
  });

  it('крапка як десятковий', () => {
    expect(parsePromNumber('571.00 грн')).toBe(571);
  });

  it('просте число і порожні значення', () => {
    expect(parsePromNumber('571')).toBe(571);
    expect(parsePromNumber('')).toBe(0);
    expect(parsePromNumber(null)).toBe(0);
    expect(parsePromNumber(undefined)).toBe(0);
  });
});

describe('promOrderToOurFormat — реквізити доставки для ТТН', () => {
  // Фікстура за реальним замовленням #416867122 (склад-склад НП)
  const order = {
    id: 416867122,
    client_first_name: 'Микола', client_last_name: 'Грибенюк',
    client_phone: null, phone: '+380974957178', client_email: null, email: null,
    full_price: '1 713 грн',
    delivery_address: 'с. Сокільники (Львівська обл.), №1: вул. Шептицького, 19а',
    delivery_option: { name: 'Нова Пошта', delivery_type: '', city: null, receive_type: null, warehouse: null, address: null },
    delivery_provider_data: {
      provider: 'nova_poshta', type: 'W2W',
      recipient_address: {
        city_id: 'ecd353bd-9fdf-11e5-a023-005056887b8d',
        city_name: 'с. Сокільники (Львівська обл.)',
        warehouse_id: 'ecd353d1-9fdf-11e5-a023-005056887b8d',
        recipient_warehouse_id: 'ecd353d1-9fdf-11e5-a023-005056887b8d',
        building_number: null, apartment_number: null,
      },
    },
    delivery_recipient: { phone: '+380974957178', first_name: 'Микола', last_name: 'Грибенюк', second_name: '' },
    payment_option: { name: 'Накладений платіж', payment_type: 'cash_on_delivery' },
    products: [{ id: 1, external_id: 'SKU1', sku: 'SKU1', name: 'Товар', quantity: 3, price: '571 грн', total_price: '1 713 грн', measure_unit: 'шт' }],
    comment: null,
  } as unknown as PromOrder;

  it('НЕ зберігає Prom-ref як НП-ref (не резолвиться), лишає назву+тип для фолбека', () => {
    const m = promOrderToOurFormat(order);
    expect(m.delivery_city_ref).toBeNull();       // Prom city_id != НП SettlementRef
    expect(m.delivery_warehouse_ref).toBeNull();
    expect(m.delivery_city_name).toBe('с. Сокільники (Львівська обл.)');  // з областю → однозначний пошук
    expect(m.delivery_address).toContain('№1');   // модалка підставить відділення за номером
    expect(m.delivery_subtype).toBe('warehouse');
    expect(m.delivery_type).toBe('nova_poshta');
  });

  it('телефон, отримувач і сума розпарсені', () => {
    const m = promOrderToOurFormat(order);
    expect(m.phone).toBe('+380974957178');
    expect(m.contact).toBe('Микола Грибенюк');
    expect(m.total_price).toBe(1713);
  });

  it('адресна доставка (building_number) → subtype address', () => {
    const addr = JSON.parse(JSON.stringify(order));
    addr.delivery_provider_data.type = 'W2D';
    addr.delivery_provider_data.recipient_address.building_number = '19а';
    const m = promOrderToOurFormat(addr as PromOrder);
    expect(m.delivery_subtype).toBe('address');
  });
});

describe('promOrderToOurFormat — спосіб оплати', () => {
  const base = {
    id: 1, client_first_name: 'І', client_last_name: 'П', phone: '+380000000000',
    full_price: '100', products: [], delivery_option: null, delivery_provider_data: null,
    delivery_recipient: null,
  };

  it('Пром-оплата (evopay, paid) → prepaid і позначено оплаченим', () => {
    const m = promOrderToOurFormat({
      ...base,
      payment_option: { name: 'Пром-оплата' },
      payment_data: { type: 'evopay', status: 'paid' },
    } as unknown as PromOrder);
    expect(m.payment_type).toBe('prepaid');
    expect(m.paid).toBe(true);
  });

  it('Накладений платіж → cod і НЕ оплачено', () => {
    const m = promOrderToOurFormat({
      ...base,
      payment_option: { name: 'Накладений платіж' },
      payment_data: null,
    } as unknown as PromOrder);
    expect(m.payment_type).toBe('cod');
    expect(m.paid).toBe(false);
  });

  it('невідомий спосіб без оплати → invoice, не оплачено', () => {
    const m = promOrderToOurFormat({
      ...base,
      payment_option: { name: 'Оплата за реквізитами' },
      payment_data: null,
    } as unknown as PromOrder);
    expect(m.payment_type).toBe('invoice');
    expect(m.paid).toBe(false);
  });
});
