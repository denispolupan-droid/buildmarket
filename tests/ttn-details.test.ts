import { describe, it, expect } from 'vitest';
import { buildTtnDetails, type TtnDetails } from '../lib/ttn-details';
import { snapshotFor, type TtnSnapshot } from '../lib/ttn-snapshot';

const row = (d: TtnDetails, section: string, label: string) =>
  d.sections.find(s => s.title === section)?.rows.find(r => r.label === label);

const rzSnap: TtnSnapshot = {
  carrier: 'rz_delivery', ttn: '101268729178', created_at: '2026-10-21T09:00:00Z', created_by: 'm@x.ua',
  cod: 520, cod_manual: true, declared: 539.4, weight: 2.3, dims: { length: 30, width: 20, height: 15 }, places: 1,
  payer: 'receiver', description: 'Клей',
  recipient: { name: 'Кармаліта Юлія', phone: '380633254271', city: 'Чабани', point: 'вул. Машинобудівників, 16' },
  result: { delivery_cost: 55, payment_fee: 10.4 },
};

describe('snapshotFor', () => {
  it('знімок чужого номера не показується', () => {
    expect(snapshotFor(rzSnap, '101268729178')).toBe(rzSnap);
    expect(snapshotFor(rzSnap, '999')).toBeNull();
    expect(snapshotFor(null, '101268729178')).toBeNull();
  });
});

describe('buildTtnDetails', () => {
  it('ROZETKA Доставка: післяплата й вага — зі знімка, статус — з історії перевізника', () => {
    const d = buildTtnDetails({
      carrier: 'rz_delivery', ttn: '101268729178', snapshot: rzSnap,
      order: { rz_delivery_cost: 55, rz_payment_fee: 10.4, rz_delivery_payer: 'receiver' },
      rzHistory: [{ status_name: 'Створено', date: '2026-10-21 12:00' }, { status_name: 'Прийнято', date: '2026-10-21 15:00' }],
    });
    expect(row(d, 'Гроші', 'Післяплата')?.value).toBe('520 ₴');
    expect(row(d, 'Гроші', 'Післяплата')?.hint).toMatch(/вручну/);
    expect(row(d, 'Гроші', 'Доставку оплачує')?.value).toBe('Отримувач');
    expect(row(d, 'Посилка', 'Вага')?.value).toBe('2.3 кг');
    expect(row(d, 'Посилка', 'Габарити')?.value).toBe('30 × 20 × 15 см');
    expect(row(d, 'Статус', 'Статус')?.value).toBe('Прийнято');
    expect(d.history[0].status_name).toBe('Прийнято'); // свіже зверху
    expect(d.notes).toEqual([]);
  });

  it('стара накладна ROZETKA Доставки без знімка — пояснює, чого немає', () => {
    const d = buildTtnDetails({ carrier: 'rz_delivery', ttn: '1', snapshot: null, order: { contact: 'Іван', rz_delivery_cost: 55 } });
    expect(row(d, 'Гроші', 'Післяплата')).toBeUndefined();
    expect(row(d, 'Отримувач', 'ПІБ')?.value).toBe('Іван');
    expect(d.notes.join(' ')).toMatch(/післяплати/);
  });

  it('Нова Пошта: живі дані перевізника важливіші за знімок', () => {
    const d = buildTtnDetails({
      carrier: 'np', ttn: '20450000000000', snapshot: null, order: {},
      np: {
        Status: 'Отримано', AfterpaymentOnGoodsCost: '755', AnnouncedPrice: '755', DocumentCost: '95',
        PayerType: 'Recipient', CityRecipient: 'Одеса', WarehouseRecipient: 'Відділення №5',
        RecipientFullName: 'Петренко Іван', DocumentWeight: '3', FactualWeight: '3.4', SeatsAmount: '1', ServiceType: 'WarehouseWarehouse',
      },
    });
    expect(row(d, 'Гроші', 'Післяплата')?.value).toBe('755 ₴');
    expect(row(d, 'Гроші', 'Вартість доставки')?.value).toBe('95 ₴');
    expect(row(d, 'Гроші', 'Доставку оплачує')?.value).toBe('Отримувач');
    expect(row(d, 'Отримувач', 'Точка / відділення')?.value).toBe('Відділення №5');
    expect(row(d, 'Посилка', 'Вага')?.value).toBe('3.4 кг');
    expect(row(d, 'Посилка', 'Тип доставки')?.value).toBe('Відділення → відділення');
  });

  it('кілька місць: однакові — одним рядком, різні — по кожному; зведені габарити не показуються', () => {
    const box = { weight: 5, length: 30, width: 30, height: 35 };
    const same = buildTtnDetails({
      carrier: 'rozetka_delivery', ttn: 'RMP-2', order: {},
      snapshot: { carrier: 'rozetka_delivery', ttn: 'RMP-2', created_at: '2026-10-28T09:00:00Z', cod: 0, weight: 10, dims: box, places: 2, seats: [box, box] },
    });
    expect(row(same, 'Посилка', 'Місця')?.value).toBe('2 × (5 кг, 30 × 30 × 35 см)');
    expect(row(same, 'Посилка', 'Габарити')).toBeUndefined();

    const diff = buildTtnDetails({
      carrier: 'rozetka_delivery', ttn: 'RMP-3', order: {},
      snapshot: {
        carrier: 'rozetka_delivery', ttn: 'RMP-3', created_at: '2026-10-28T09:00:00Z', cod: 0, weight: 7, dims: box, places: 2,
        seats: [box, { weight: 2, length: 20, width: 10, height: 10 }],
      },
    });
    expect(row(diff, 'Посилка', 'Місця')?.value).toBe('1) 5 кг, 30 × 30 × 35 см; 2) 2 кг, 20 × 10 × 10 см');
    expect(row(diff, 'Посилка', 'Місць')?.value).toBe('2');
  });

  it('Rozetka маркетплейс: післяплата 0 — «без післяплати», отримувач із замовлення Rozetka', () => {
    const d = buildTtnDetails({
      carrier: 'rozetka_delivery', ttn: 'RMP-1', snapshot: null,
      order: { rozetka_delivery: { recipient_title: 'Кривий Сергій', recipient_phone: '380955740326', city: { title: 'Одеса' } } },
      rozetka: { cod_amount: 0, declared_price: 660, delivery_price: '35.00' },
    });
    expect(row(d, 'Гроші', 'Післяплата')?.value).toBe('без післяплати');
    expect(row(d, 'Гроші', 'Доставку оплачує')?.value).toBe('Відправник (ми)');
    expect(row(d, 'Отримувач', 'ПІБ')?.value).toBe('Кривий Сергій');
    expect(row(d, 'Отримувач', 'Місто')?.value).toBe('Одеса');
  });
});
