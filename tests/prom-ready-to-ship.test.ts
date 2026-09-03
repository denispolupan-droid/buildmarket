import { describe, it, expect } from 'vitest';
import { promAvailability, readyToShipEnabled } from '../lib/prom-ready-to-ship';

describe('readyToShipEnabled — перемикач «Готово до відправки»', () => {
  it('відсутнє налаштування = увімкнено', () => {
    expect(readyToShipEnabled(undefined)).toBe(true);
    expect(readyToShipEnabled(null)).toBe(true);
    expect(readyToShipEnabled('')).toBe(true);
  });
  it('off вимикає, будь-що інше вмикає', () => {
    expect(readyToShipEnabled('off')).toBe(false);
    expect(readyToShipEnabled('on')).toBe(true);
  });
});

describe('promAvailability — спільне правило фіда і API-пушу', () => {
  it('в наявності + перемикач увімкнено → available + in_stock + залишок', () => {
    expect(promAvailability({ enabled: true, stockStatus: 'in_stock', stockQty: 7, readyToShip: true }))
      .toEqual({ presence: 'available', in_stock: true, quantity_in_stock: 7 });
  });

  it('постачальник з умовним залишком (qty=0, статус in_stock) — теж готово до відправки', () => {
    expect(promAvailability({ enabled: true, stockStatus: 'in_stock', stockQty: 0, readyToShip: true }))
      .toEqual({ presence: 'available', in_stock: true, quantity_in_stock: 0 });
  });

  it('перемикач вимкнено → available без in_stock', () => {
    expect(promAvailability({ enabled: true, stockStatus: 'in_stock', stockQty: 3, readyToShip: false }))
      .toEqual({ presence: 'available', in_stock: false, quantity_in_stock: 3 });
  });

  it('немає в наявності / під замовлення → not_available, in_stock=false, залишок 0', () => {
    expect(promAvailability({ enabled: true, stockStatus: 'out_of_stock', stockQty: 5, readyToShip: true }))
      .toEqual({ presence: 'not_available', in_stock: false, quantity_in_stock: 0 });
    expect(promAvailability({ enabled: true, stockStatus: 'on_order', stockQty: 0, readyToShip: true }))
      .toEqual({ presence: 'not_available', in_stock: false, quantity_in_stock: 0 });
  });

  it('вимкнений для Prom товар — недоступний незалежно від залишку', () => {
    expect(promAvailability({ enabled: false, stockStatus: 'in_stock', stockQty: 9, readyToShip: true }))
      .toEqual({ presence: 'not_available', in_stock: false, quantity_in_stock: 0 });
  });

  it('дробовий або від’ємний залишок нормалізується', () => {
    expect(promAvailability({ enabled: true, stockStatus: 'in_stock', stockQty: 2.7, readyToShip: true }).quantity_in_stock).toBe(2);
    expect(promAvailability({ enabled: true, stockStatus: 'in_stock', stockQty: -1, readyToShip: true }).quantity_in_stock).toBe(0);
  });
});
